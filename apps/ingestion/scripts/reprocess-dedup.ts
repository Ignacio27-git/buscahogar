// ROADMAP 1.10 — reproceso completo de deduplicación (diseño, "Data flow";
// D9): bloqueo → clasificación → agrupación → consolidación, sobre datos YA
// ingeridos. ÚNICO lector de `process.env` de este cambio (D9, mismo
// contrato que scripts/calibrate-blocking.ts, paso 1.8): `readEnv`,
// `parseReprocessArgs` y `buildReprocessReport` son puros; ninguna función
// de `@buscahogar/db` invocada aquí lee el entorno. Este fichero NO importa
// nada de `src/sources/**` — frontera reforzada estructuralmente por
// eslint.config.mjs (D11, CHK-NOSOURCES-LINT) y probada en ejecución por
// test/db/reprocess-dedup.db.test.ts (D12): cero peticiones de red, cero
// cuota (REPRO-1, ROADMAP 1.10, criterio de revisión propio del paso).
//
// Sin test dedicado dentro de este propio fichero — mismo precedente que
// scripts/calibrate-blocking.ts (paso 1.8, comentario de cabecera): es el
// shell de orquestación de módulos que YA están testeados por separado
// (options, report — cada uno con su suite offline propia; blocking,
// hydration, consolidation — Unit A/C, con sus propias suites contra
// PostgreSQL real). La única prueba que ejercita ESTE fichero es
// test/db/reprocess-dedup.db.test.ts (D12): cubre a la vez REPRO-1 (cero
// red) y, extremo a extremo, que la composición entera no revienta.
import { fileURLToPath } from 'node:url';

import { buildPropertyGroups, classify, ruleBasedDedupStrategy, selectWinningListing } from '@buscahogar/core';
import type { ClassifiedPair, WinnerCandidate } from '@buscahogar/core';
import { createDb, findCandidatePairs, hydrateListingsForDedup, listingVersions, listings, writeConsolidation } from '@buscahogar/db';
import type { ConsolidationGroupInput, ConsolidationPairInput, Database } from '@buscahogar/db';
import { and, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { parseReprocessArgs } from '../src/dedup/options.js';
import { buildReprocessReport } from '../src/dedup/report.js';
import type { ReprocessReport } from '../src/dedup/report.js';

export class ReprocessEnvError extends Error {}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export interface ReprocessEnv {
  readonly databaseUrl: string;
}

// Nunca lee `process.env` directamente (mismo contrato que
// scripts/calibrate-blocking.ts): recibe el entorno como parámetro, para
// que el fallo se pueda testear sin tocar el proceso real. `main()` es el
// único llamador con `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): ReprocessEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ReprocessEnvError('Falta la variable de entorno DATABASE_URL: debe estar definida y no vacía.');
  }
  return { databaseUrl: parsed.data.DATABASE_URL };
}

export interface ReprocessIo {
  log(line: string): void;
}

interface CurrentVersionInfo {
  readonly versionId: string;
  readonly capturedAt: Date;
}

// Bookkeeping propio de este composition root, deliberadamente NO añadido a
// `packages/db` (Unit C, obs #164, ya cerrada): `hydrateListingsForDedup`
// (D7) construye un `Listing` de dominio "…ForDedup" — por diseño, ni ese ni
// ningún otro export existente devuelve el id de la versión vigente NI su
// `capturedAt`. Ambos hacen falta aquí: el primero para
// `dedup_pair_evidence.scoredListingVersionId*` (D1/EVID-1), el segundo
// para el desempate de `selectWinningListing` (D4, tercera clave aparte).
// Misma columna booleana desnuda que `blocking.ts` (`sql\`${col}\``) por
// consistencia de idioma con el resto del repositorio, aunque aquí no hay
// ningún índice parcial que preservar.
async function fetchCurrentVersionInfo(
  db: Database,
  listingIds: readonly string[]
): Promise<Map<string, CurrentVersionInfo>> {
  if (listingIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      listingId: listingVersions.listingId,
      versionId: listingVersions.id,
      capturedAt: listingVersions.capturedAt,
    })
    .from(listingVersions)
    .where(and(inArray(listingVersions.listingId, listingIds), sql`${listingVersions.isCurrent}`));

  const result = new Map<string, CurrentVersionInfo>();
  for (const row of rows) {
    result.set(row.listingId, { versionId: row.versionId, capturedAt: row.capturedAt });
  }
  return result;
}

// Corpus COMPLETO de anuncios, no solo los que aparecen en algún par
// candidato: un anuncio sin ningún otro anuncio dentro del radio de
// bloqueo nunca aparece como extremo de un CandidatePair, y aun así
// EVID-3/PROP-3b exige que reciba su propia vivienda singleton
// (`buildPropertyGroups` itera sobre `listingIds`, no sobre los ids que
// aparecieron en algún par — packages/core/src/consolidation/grouping.ts).
// Igual que el bloqueo (`blocking.ts`, Q1/CBQ-9), esta consulta NO filtra
// por `sourceId` ni por `status`: el reproceso debe ser tan permisivo como
// el bloqueo que reutiliza.
async function fetchAllListingIds(db: Database): Promise<readonly string[]> {
  const rows = await db.select({ id: listings.id }).from(listings);
  return rows.map((row) => row.id);
}

export async function runReprocess(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: ReprocessIo
): Promise<number> {
  let thresholds: ReturnType<typeof parseReprocessArgs>;
  try {
    thresholds = parseReprocessArgs(argv);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  let databaseUrl: string;
  try {
    ({ databaseUrl } = readEnv(env));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Variables de entorno inválidas.');
    return 2;
  }

  const { db, pool } = createDb(databaseUrl);
  try {
    // 1. Bloqueo (paso 1.8, blocking.ts): global, sin estado, cero red.
    const candidatePairs = await findCandidatePairs(db, thresholds);

    // 2. Corpus completo + hidratación (D7) — nunca solo los ids de los
    // pares candidatos (ver comentario de fetchAllListingIds).
    const listingIds = await fetchAllListingIds(db);
    const hydrated = await hydrateListingsForDedup(db, listingIds);
    const versionInfo = await fetchCurrentVersionInfo(db, listingIds);

    // 3. Clasificación (paso 1.9, strategy.ts/classify.ts): PURA, un par a
    // la vez. Nada se persiste todavía — eso es el paso 5.
    const classifiedPairs: ClassifiedPair[] = [];
    const pairInputs: ConsolidationPairInput[] = [];
    for (const pair of candidatePairs) {
      const listingA = hydrated.get(pair.listingAId);
      const listingB = hydrated.get(pair.listingBId);
      if (!listingA || !listingB) {
        // Invariante: todo id que aparece en un CandidatePair pertenece al
        // corpus completo ya hidratado arriba — si esto salta, el bloqueo y
        // la hidratación dejaron de estar de acuerdo sobre qué es un
        // "listing" vigente.
        throw new Error(
          `runReprocess: el par candidato (${pair.listingAId}, ${pair.listingBId}) referencia un listing sin hidratar.`
        );
      }
      const result = ruleBasedDedupStrategy.score(listingA, listingB);
      const band = classify(result);
      classifiedPairs.push({ listingAId: pair.listingAId, listingBId: pair.listingBId, band, score: result.score });

      const versionA = versionInfo.get(pair.listingAId);
      const versionB = versionInfo.get(pair.listingBId);
      pairInputs.push({
        listingAId: pair.listingAId,
        listingBId: pair.listingBId,
        band,
        score: result.score,
        signals: result.signals,
        ...(versionA !== undefined ? { scoredListingVersionIdA: versionA.versionId } : {}),
        ...(versionB !== undefined ? { scoredListingVersionIdB: versionB.versionId } : {}),
      });
    }

    // 4. Agrupación (D3) — recibe el corpus COMPLETO, no solo los ids con
    // algún par, para que un anuncio sin ninguna comparación siga recibiendo
    // su propio grupo singleton (EVID-3/PROP-3b).
    const { groups, refusedComponents } = buildPropertyGroups(listingIds, classifiedPairs);

    // 5. Selección del ganador por grupo (D4) — PURA, sobre datos ya
    // hidratados en memoria; ninguna consulta nueva por grupo.
    const consolidationGroups: ConsolidationGroupInput[] = groups.map((group) => {
      const candidates: WinnerCandidate[] = group.listingIds.map((listingId) => {
        const listing = hydrated.get(listingId);
        const version = versionInfo.get(listingId);
        if (!listing || !version) {
          throw new Error(`runReprocess: falta hidratación o versión vigente para el listing "${listingId}".`);
        }
        return { listing, listingId, capturedAt: version.capturedAt };
      });
      const winner = selectWinningListing(candidates);
      return { listingIds: group.listingIds, winnerId: winner.listingId };
    });

    // 6. Escritura transaccional (D1, D5, D6, D8) — evidencia completa de
    // cada par clasificado + reconstrucción íntegra de la caché, en una
    // única transacción.
    const outcome = await writeConsolidation(db, {
      strategyName: ruleBasedDedupStrategy.name,
      strategyVersion: ruleBasedDedupStrategy.version,
      radiusMeters: thresholds.radiusMeters,
      priceBandCents: thresholds.priceBandCents,
      surfaceToleranceM2: thresholds.surfaceToleranceM2,
      listingsConsidered: listingIds.length,
      pairs: pairInputs,
      groups: consolidationGroups,
      refusedComponentsCount: refusedComponents.length,
    });

    // 7. Informe (D9, REPRO-2) — PURO, JSON a stdout (mismo formato que
    // scripts/calibrate-blocking.ts).
    const report: ReprocessReport = buildReprocessReport({
      run: {
        runId: outcome.runId,
        strategyName: ruleBasedDedupStrategy.name,
        strategyVersion: ruleBasedDedupStrategy.version,
        startedAt: outcome.startedAt.toISOString(),
      },
      thresholds,
      listingsConsidered: listingIds.length,
      pairs: classifiedPairs,
      groups,
      refusedComponents,
      propertiesCreated: outcome.propertiesCreated,
    });
    io.log(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: ReprocessIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };

  process.exitCode = await runReprocess(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

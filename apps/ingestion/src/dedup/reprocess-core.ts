// ROADMAP 1.10 (bloqueo → clasificación → agrupación → consolidación) +
// ROADMAP 1.13 Unit C (diseño DD-10, CR-2 mismo principio de reutilización
// exacta) — núcleo REUTILIZABLE del reproceso global de deduplicación.
// Extraído de `scripts/reprocess-dedup.ts` (donde vivía completo desde el
// paso 1.10) a `src/dedup/` para que `src/sweep/coverage-worker-ports.ts`
// (el worker, DD-18 paso 12) invoque el MISMO camino sobre su pool
// COMPARTIDO, coalescido a como mucho una vez por tick — sin volver a abrir
// y cerrar un pool por invocación ni sintetizar un argv falso. Misma
// dirección de dependencia que el resto del paquete: `scripts/**` consume
// `src/**`, nunca al revés (mismo motivo que compose-store.ts).
//
// Cero I/O de entorno/argv aquí: recibe `db` y `thresholds` ya resueltos,
// igual que `findCandidatePairs`/`hydrateListingsForDedup` reciben `db`.
// Mismo ban de fuentes externas que el resto de `src/dedup/**`
// (eslint.config.mjs, D11, CHK-NOSOURCES-LINT): cero peticiones, cero cuota
// — `scripts/reprocess-dedup.ts` sigue siendo el ÚNICO lector de
// `process.env`/argv de este camino (D9).
import { buildPropertyGroups, classify, ruleBasedDedupStrategy, selectWinningListing } from '@buscahogar/core';
import type { BlockingThresholds, ClassifiedPair, WinnerCandidate } from '@buscahogar/core';
import { findCandidatePairs, hydrateListingsForDedup, listingVersions, listings, writeConsolidation } from '@buscahogar/db';
import type { ConsolidationGroupInput, ConsolidationPairInput, Database } from '@buscahogar/db';
import { and, inArray, sql } from 'drizzle-orm';

import { buildReprocessReport } from './report.js';
import type { ReprocessReport } from './report.js';

export interface ReprocessIo {
  log(line: string): void;
}

interface CurrentVersionInfo {
  readonly versionId: string;
  readonly capturedAt: Date;
}

// Bookkeeping propio de este núcleo, deliberadamente NO añadido a
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
// por `sourceId`, `status`, NI POR ZONA (ROADMAP 1.13, DD-10): el reproceso
// debe ser tan permisivo como el bloqueo que reutiliza, incluido tras un
// barrido dirigido por el worker.
async function fetchAllListingIds(db: Database): Promise<readonly string[]> {
  const rows = await db.select({ id: listings.id }).from(listings);
  return rows.map((row) => row.id);
}

export async function runReprocessCore(
  db: Database,
  thresholds: BlockingThresholds,
  io: ReprocessIo
): Promise<ReprocessReport> {
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
        `runReprocessCore: el par candidato (${pair.listingAId}, ${pair.listingBId}) referencia un listing sin hidratar.`
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
        throw new Error(`runReprocessCore: falta hidratación o versión vigente para el listing "${listingId}".`);
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
  return report;
}

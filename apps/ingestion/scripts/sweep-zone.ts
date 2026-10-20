// Paso 1.7 — comando de CLI para barrer una zona (diseño, "Data flow"). ÚNICO
// lector de `process.env` de este cambio (D5, D8), junto con el seed de
// `packages/db`, que es un fichero distinto. Composition root: cablea el
// puerto HTTP real de Idealista (1.6), el normalizador (1.6), los dos
// puertos de escritura (`listing-writer.ts` + `coverage-store.ts`, fase 2-3)
// y el driver puro del barrido (`sweep-runner.ts`, fase 1) — ninguno de esos
// módulos lee `process.env` ni abre una conexión por sí mismo.
//
// Sin test dedicado, mismo precedente que `scripts/probe-idealista.ts`
// (paso 1.5): es el shell de orquestación de módulos que YA están
// testeados por separado (options, area, reference-store, coverage-store,
// listing-writer, sweep-runner, report — todos con su propia suite). Cubrir
// este fichero exigiría o bien red real o bien un contenedor PostgreSQL
// completo con mocking de fetch, que no añade nada sobre lo que esos tests
// ya demuestran por separado.
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { createDb } from '@buscahogar/db';

import {
  createHttpSearchPort,
  createHttpTokenPort,
  createIdealistaSource,
  IdealistaListingNormalizer,
} from '../src/sources/idealista/index.js';
import { areaFingerprint, buildArea } from '../src/sweep/area.js';
import { composeStore } from '../src/sweep/compose-store.js';
import { parseSweepArgs } from '../src/sweep/options.js';
import type { SweepOptions } from '../src/sweep/options.js';
import { buildReport } from '../src/sweep/report.js';
import { resolveSourceUuid, resolveZoneByIneCode } from '../src/sweep/reference-store.js';
import { runSweep } from '../src/sweep/sweep-runner.js';
import type { ClaimedJob } from '../src/sweep/store.js';

export interface SweepEnv {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly databaseUrl: string;
}

export class SweepEnvError extends Error {}

const EnvSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

// Nunca lee `process.env` directamente: recibe el entorno como parámetro,
// igual que `readCredentials` de `scripts/probe-idealista.ts`, así que un
// test puede ejercitar el fallo sin tocar el proceso real. `main()` es el
// único llamador con `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): SweepEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new SweepEnvError(
      'Faltan variables de entorno: IDEALISTA_API_KEY, IDEALISTA_API_SECRET y DATABASE_URL deben estar definidas y no vacías.'
    );
  }
  return {
    apiKey: parsed.data.IDEALISTA_API_KEY,
    apiSecret: parsed.data.IDEALISTA_API_SECRET,
    databaseUrl: parsed.data.DATABASE_URL,
  };
}

export interface SweepIo {
  log(line: string): void;
}

export async function runSweepZone(options: SweepOptions, env: SweepEnv, io: SweepIo): Promise<number> {
  const area = buildArea(options);
  const fingerprint = areaFingerprint(area);

  const { db, pool } = createDb(env.databaseUrl);
  try {
    // sources.key='idealista' → uuid e ine_code → zone, resueltos UNA vez
    // por barrido (diseño D5 paso 1). Un fallo aquí aborta ANTES de
    // reclamar ningún trabajo y ANTES de escribir ningún listing (PERSIST-9).
    let sourceUuid: string;
    let zoneId: string;
    try {
      sourceUuid = await resolveSourceUuid(db, 'idealista');
      zoneId = await resolveZoneByIneCode(db, options.zone);
    } catch (error) {
      io.log(error instanceof Error ? error.message : 'No se pudo resolver la fuente o la zona.');
      return 2;
    }

    const store = composeStore(db);

    // Reclamo CAS (coverage-store.ts, diseño D6) ANTES de invocar el driver
    // del barrido — si falla, `runSweep` ni siquiera se llega a invocar, lo
    // que completa estructuralmente la garantía de "cero peticiones" de
    // COVERAGE-3a.
    let job: ClaimedJob;
    try {
      job = await store.claimJob(zoneId, sourceUuid, options.operation, fingerprint);
    } catch (error) {
      io.log(error instanceof Error ? error.message : 'No se pudo reclamar el trabajo de barrido.');
      return 3;
    }

    const source = createIdealistaSource({
      searchPort: createHttpSearchPort(),
      tokenPort: createHttpTokenPort({ apiKey: env.apiKey, apiSecret: env.apiSecret }),
      maxSearchRequestsPerSweep: options.maxSearchRequestsPerSweep,
    });
    const normalizer = new IdealistaListingNormalizer();

    const result = await runSweep({ source, normalizer, store, area, job, sourceUuid, fingerprint });

    const report = buildReport({
      area,
      outcome: result.outcome,
      inserted: result.inserted,
      versioned: result.versioned,
      unchanged: result.unchanged,
      rejectedCount: result.rejectedCount,
      resumeCursor: result.resumeCursor,
      error: result.error,
      // Únicamente peticiones de búsqueda (D1: el runner no lleva contador
      // propio, el tope y su contabilidad viven en budget.ts, 1.6).
      requestsSpent: source.diagnostics().budget.search,
    });

    io.log(JSON.stringify(report, null, 2));

    const diagnostics = source.diagnostics();
    if (diagnostics.unmappedPropertyTypes.length > 0) {
      io.log(`Tipos de propiedad no reconocidos (sin mapeo): ${diagnostics.unmappedPropertyTypes.join(', ')}`);
    }

    // Enrutado de exit code por outcome (diseño D6): 'completed' y
    // 'budget-exhausted' son 0 — alcanzar el tope y reanudar es el diseño
    // esperado (1.6 A3), no un fallo. Solo 'failed' es no-cero.
    return result.outcome === 'failed' ? 1 : 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: SweepIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };

  let options: SweepOptions;
  try {
    options = parseSweepArgs(process.argv.slice(2));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    process.exitCode = 2;
    return;
  }

  let env: SweepEnv;
  try {
    env = readEnv(process.env);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Variables de entorno inválidas.');
    process.exitCode = 2;
    return;
  }

  process.exitCode = await runSweepZone(options, env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/probe-idealista.ts y src/index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

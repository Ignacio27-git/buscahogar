// ROADMAP 1.13 Unit C (diseño DD-17, DD-18, CR-1) — composition root y
// ÚNICO punto de entrada real del daemon de cobertura bajo demanda. ÚNICO
// lector de `process.env` de este módulo (D5/D8, mismo contrato que
// scripts/sweep-zone.ts): cablea el puerto HTTP real de Idealista (1.6), el
// resto de puertos reales (`src/sweep/coverage-worker-ports.ts`) y el
// driver puro del worker (`src/sweep/coverage-worker.ts`) sobre UN pool
// compartido para la vida entera del proceso — nunca un pool por trabajo
// (CR-1/CR-2: ese es exactamente el defecto que `runSweepZone` tendría si
// se reutilizara entero para esto).
//
// Sin test dedicado — mismo precedente que `scripts/sweep-zone.ts:9-15` y
// `scripts/reprocess-dedup.ts`: es el shell de orquestación de módulos que
// YA están testeados por separado (coverage-worker.ts contra fakes,
// coverage-worker-ports.ts contra PostgreSQL real con Idealista falso).
// Cubrir ESTE fichero exigiría o bien red real o bien duplicar exactamente
// lo que esas dos suites ya demuestran.
//
// CR-1 (arbitraje, vinculante): `src/index.ts` es el barril del paquete, no
// este entrypoint — ver el comentario que reemplaza su `main()` placeholder.
import { fileURLToPath } from 'node:url';

import { blockingThresholdsSchema } from '@buscahogar/core';
import { createDb } from '@buscahogar/db';
import { z } from 'zod';

import { createRealCoverageWorkerPorts } from '../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../src/sweep/coverage-worker.js';
import { resolveSourceUuid } from '../src/sweep/reference-store.js';
import { createHttpSearchPort, createHttpTokenPort } from '../src/sources/idealista/index.js';

export class WorkerEnvError extends Error {}

// Ampliación deliberada y documentada de las variables de sweep-zone.ts
// (IDEALISTA_API_KEY/SECRET, DATABASE_URL, reutilizadas sin cambio):
// OPERATION y los tres umbrales de bloqueo son genuinamente nuevos porque
// ningún artefacto (spec/diseño/tasks) fija de dónde sale ninguno de los
// dos para un trabajo encolado — ver el comentario de
// CoverageWorkerOptions.operation en src/sweep/coverage-worker.ts.
// DAILY_SEARCH_CAP nunca lleva un valor por defecto (decisión 066: la
// cuota mensual real de Idealista no está confirmada por ninguna fuente
// oficial, así que este número es SIEMPRE responsabilidad del operador).
const EnvSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  OPERATION: z.enum(['sale', 'rent']),
  DAILY_SEARCH_CAP: z.string().min(1),
  BLOCKING_RADIUS_METERS: z.string().min(1),
  BLOCKING_PRICE_BAND_CENTS: z.string().min(1),
  BLOCKING_SURFACE_TOLERANCE_M2: z.string().min(1),
  POLL_INTERVAL_MS: z.string().min(1).optional(),
  MAX_SEARCH_REQUESTS_PER_SWEEP: z.string().min(1).optional(),
  MAX_ATTEMPTS: z.string().min(1).optional(),
  // ROADMAP 2.5 (decisión 104). Se validan con Zod más abajo (mensaje que
  // nombra la variable); aquí solo se declara que existen. Sin `.min(1)` a
  // propósito: una cadena vacía debe llegar al validador y rechazarse, no
  // tratarse como ausente.
  REFRESH_BUDGET_FRACTION: z.string().optional(),
  MAINTENANCE_EVERY_TICKS: z.string().min(1).optional(),
});

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, S-ZRS-18) —
// fracción del tope diario que el refresco puede gastar EN TOTAL. Es una
// decisión de operación (decisión 066: nunca un número inventado en código):
// AUSENTE = 0, el refresco queda desactivado y no gasta cuota. `0` lo
// desactiva explícitamente; `1` deja todo el tope al refresco.
const refreshBudgetFractionSchema = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().min(0).max(1));
const DEFAULT_REFRESH_BUDGET_FRACTION = 0;
// El worker sondea cada `POLL_INTERVAL_MS` (15 s por defecto): 20 ticks ≈ 5
// minutos entre pasadas de mantenimiento, con el primer tick incluido.
const DEFAULT_MAINTENANCE_EVERY_TICKS = 20;

function parseRefreshBudgetFraction(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REFRESH_BUDGET_FRACTION;
  }
  const parsed = refreshBudgetFractionSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkerEnvError(
      `REFRESH_BUDGET_FRACTION inválido "${value}": se espera un número entre 0 y 1 (0 desactiva el refresco).`
    );
  }
  return parsed.data;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP = 10;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface WorkerEnv {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly databaseUrl: string;
  readonly options: CoverageWorkerOptions;
  readonly blockingThresholds: ReturnType<typeof blockingThresholdsSchema.parse>;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new WorkerEnvError(`${name} inválido "${value}": se espera un entero positivo.`);
  }
  return parsed;
}

// Nunca lee `process.env` directamente: recibe el entorno como parámetro,
// igual que `readEnv` de scripts/sweep-zone.ts, para que el fallo se pueda
// testear sin tocar el proceso real. `main()` es el único llamador con
// `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): WorkerEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new WorkerEnvError(
      'Faltan variables de entorno: IDEALISTA_API_KEY, IDEALISTA_API_SECRET, DATABASE_URL, OPERATION, ' +
        'DAILY_SEARCH_CAP, BLOCKING_RADIUS_METERS, BLOCKING_PRICE_BAND_CENTS y BLOCKING_SURFACE_TOLERANCE_M2 ' +
        'deben estar definidas y no vacías.'
    );
  }
  const raw = parsed.data;

  const blockingThresholds = blockingThresholdsSchema.safeParse({
    radiusMeters: parsePositiveInteger('BLOCKING_RADIUS_METERS', raw.BLOCKING_RADIUS_METERS),
    priceBandCents: parsePositiveInteger('BLOCKING_PRICE_BAND_CENTS', raw.BLOCKING_PRICE_BAND_CENTS),
    surfaceToleranceM2: parsePositiveInteger('BLOCKING_SURFACE_TOLERANCE_M2', raw.BLOCKING_SURFACE_TOLERANCE_M2),
  });
  if (!blockingThresholds.success) {
    const firstIssue = blockingThresholds.error.issues[0];
    throw new WorkerEnvError(
      `Umbral de bloqueo inválido (campo: ${String(firstIssue?.path[0] ?? '?')}): ${firstIssue?.message ?? 'sin detalle'}.`
    );
  }

  return {
    apiKey: raw.IDEALISTA_API_KEY,
    apiSecret: raw.IDEALISTA_API_SECRET,
    databaseUrl: raw.DATABASE_URL,
    blockingThresholds: blockingThresholds.data,
    options: {
      operation: raw.OPERATION,
      pollIntervalMs:
        raw.POLL_INTERVAL_MS !== undefined
          ? parsePositiveInteger('POLL_INTERVAL_MS', raw.POLL_INTERVAL_MS)
          : DEFAULT_POLL_INTERVAL_MS,
      maxSearchRequestsPerSweep:
        raw.MAX_SEARCH_REQUESTS_PER_SWEEP !== undefined
          ? parsePositiveInteger('MAX_SEARCH_REQUESTS_PER_SWEEP', raw.MAX_SEARCH_REQUESTS_PER_SWEEP)
          : DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP,
      dailySearchCap: parsePositiveInteger('DAILY_SEARCH_CAP', raw.DAILY_SEARCH_CAP),
      maxAttempts:
        raw.MAX_ATTEMPTS !== undefined ? parsePositiveInteger('MAX_ATTEMPTS', raw.MAX_ATTEMPTS) : DEFAULT_MAX_ATTEMPTS,
      refreshBudgetFraction: parseRefreshBudgetFraction(raw.REFRESH_BUDGET_FRACTION),
      maintenanceEveryTicks:
        raw.MAINTENANCE_EVERY_TICKS !== undefined
          ? parsePositiveInteger('MAINTENANCE_EVERY_TICKS', raw.MAINTENANCE_EVERY_TICKS)
          : DEFAULT_MAINTENANCE_EVERY_TICKS,
    },
  };
}

export async function main(): Promise<void> {
  let env: WorkerEnv;
  try {
    env = readEnv(process.env);
  } catch (error) {
    console.log(error instanceof Error ? error.message : 'Variables de entorno inválidas.');
    process.exitCode = 2;
    return;
  }

  const { db, pool } = createDb(env.databaseUrl);

  // R11: apagado ordenado. `running` se comprueba SIEMPRE al principio de
  // cada tick (coverage-worker.ts::runCoverageWorker), nunca en mitad de
  // uno — SIGINT/SIGTERM deja terminar el tick en curso, cierra el pool
  // después, y no arranca ningún tick nuevo.
  let running = true;
  const stop = (signal: string): void => {
    console.log(`coverage-worker: señal ${signal} recibida — terminando el tick en curso, sin arrancar uno nuevo.`);
    running = false;
  };
  process.on('SIGINT', () => {
    stop('SIGINT');
  });
  process.on('SIGTERM', () => {
    stop('SIGTERM');
  });

  try {
    const sourceUuid = await resolveSourceUuid(db, 'idealista');

    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid,
      searchPort: createHttpSearchPort(),
      tokenPort: createHttpTokenPort({ apiKey: env.apiKey, apiSecret: env.apiSecret }),
      maxSearchRequestsPerSweep: env.options.maxSearchRequestsPerSweep,
      maxAttempts: env.options.maxAttempts,
      dailySearchCap: env.options.dailySearchCap,
      refreshBudgetFraction: env.options.refreshBudgetFraction,
      blockingThresholds: env.blockingThresholds,
      io: {
        log: (line: string): void => {
          console.log(line);
        },
      },
    });

    await runCoverageWorker(ports, { ...env.options, shouldContinue: () => running });
  } finally {
    await pool.end();
  }
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/sweep-zone.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

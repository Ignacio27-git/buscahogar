// ROADMAP 2.4 (search-indexing-performance) — bench-options.ts (diseño D4,
// "both argument schemas, cold mode, guard"). Único módulo que valida los
// argumentos de las DOS CLIs del banco (`generate-search-corpus.ts`,
// `bench-search.ts`) y el guard de aislamiento de base de datos que ambas
// comparten y que también reutiliza `test/db/search-bench.db.test.ts`
// (diseño decisión 4/10). Nada de esto abre conexión ni lee `process.env`:
// eso lo hacen los scripts (fase 1 tarea 1.8, fase 2 tarea 2.7), como
// `scripts/calibrate-blocking.ts` ya hace con `readEnv`.
import { parseArgs } from 'node:util';

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Guard de aislamiento (diseño D4)
// ---------------------------------------------------------------------------

export class MissingBenchDatabaseUrlError extends Error {
  constructor() {
    super(
      '--database-url es obligatorio: el banco NUNCA usa la variable de entorno DATABASE_URL como valor de reserva (diseño D4).'
    );
  }
}

export class DevDatabaseGuardError extends Error {}

const BENCH_SUFFIX = '_bench';

interface ParsedDatabaseUrl {
  readonly host: string;
  readonly port: string;
  readonly database: string;
}

function parseDatabaseUrl(raw: string): ParsedDatabaseUrl {
  const parsed = new URL(raw);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
  };
}

// Rechaza si el nombre de la base de datos no termina en "_bench" O si
// host+puerto+nombre coinciden con `devUrl` (diseño D4: "Refuse if the db
// name lacks the _bench suffix OR if host+port+db equals DATABASE_URL").
// Un `devUrl` ilegible (o ausente) nunca hace fallar esta función por sí
// solo: solo importa como comparación adicional, nunca como precondición.
export function assertBenchDatabaseUrl(url: string | undefined, devUrl: string | undefined): asserts url is string {
  if (!url) {
    throw new MissingBenchDatabaseUrlError();
  }

  const target = parseDatabaseUrl(url);
  if (!target.database.endsWith(BENCH_SUFFIX)) {
    throw new DevDatabaseGuardError(
      `--database-url apunta a la base de datos "${target.database}", que no termina en "${BENCH_SUFFIX}": el guard (diseño D4) rechaza cualquier base de datos no marcada explícitamente como de banco.`
    );
  }

  if (devUrl) {
    let dev: ParsedDatabaseUrl | null;
    try {
      dev = parseDatabaseUrl(devUrl);
    } catch {
      dev = null;
    }
    if (dev && dev.host === target.host && dev.port === target.port && dev.database === target.database) {
      throw new DevDatabaseGuardError(
        '--database-url coincide con la base de datos de desarrollo (DATABASE_URL): rechazado por seguridad, aunque provenga de una variable de entorno residual (diseño D4, fail-safe).'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Vocabulario compartido de la matriz de combinaciones (diseño, "Query
// Matrix"). Declarado aquí porque `--only` necesita validarse en esta fase
// (1), antes de que exista `src/bench/query-matrix.ts` (fase 2, tarea 2.1);
// `query-matrix.ts` importará esta misma constante en vez de duplicar la
// lista de ids.
// ---------------------------------------------------------------------------

export const BENCH_COMBINATION_IDS = [
  'default',
  'op-type',
  'price-range-rent',
  'price-desc',
  'surface-selective',
  'surface-sort',
  'rooms-baths',
  'geo-1km',
  'geo-25km-price',
  'all-filters',
  'deep-default',
  'deep-filtered',
] as const;
export type BenchCombinationId = (typeof BENCH_COMBINATION_IDS)[number];

function isBenchCombinationId(value: string): value is BenchCombinationId {
  return (BENCH_COMBINATION_IDS as readonly string[]).includes(value);
}

export const COLD_MODES = ['evict', 'restart'] as const;
export type ColdMode = (typeof COLD_MODES)[number];

function isColdMode(value: string): value is ColdMode {
  return (COLD_MODES as readonly string[]).includes(value);
}

type NamedErrorClass = new (message: string) => Error;

function parseInteger(flag: string, raw: string, ErrorClass: NamedErrorClass): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ErrorClass(`${flag} inválido: "${raw}" debe ser un número entero.`);
  }
  return value;
}

function parsePositiveInt(flag: string, raw: string, ErrorClass: NamedErrorClass): number {
  const value = parseInteger(flag, raw, ErrorClass);
  if (value <= 0) {
    throw new ErrorClass(`${flag} inválido: "${raw}" debe ser un entero positivo.`);
  }
  return value;
}

function flagNameFromIssue(issue: { readonly path: readonly PropertyKey[] } | undefined): string {
  const flagPath = issue?.path[0];
  return typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
}

// ---------------------------------------------------------------------------
// generate-search-corpus.ts (fase 1, tarea 1.8)
// ---------------------------------------------------------------------------

export class GenerateCorpusOptionsError extends Error {}

export interface GenerateCorpusOptions {
  readonly databaseUrl: string;
  readonly rows: number;
  readonly seed: number;
  readonly batchSize: number;
  readonly anchorIso: string;
  readonly truncate: boolean;
}

// Valores por defecto documentados en el diseño ("Corpus Shape", "Load
// procedure"): ~1M filas, tandas de 50k. Ninguno sustituye a --database-url,
// que SIEMPRE es obligatorio (CLI Argument Validation, spec).
const DEFAULT_ROWS = 1_000_000;
const DEFAULT_SEED = 42;
const DEFAULT_BATCH_SIZE = 50_000;

// Solo PRESENCIA y forma superficial (string no vacía) — la conversión a
// número/booleano va después, campo a campo, para nombrar el flag exacto y
// el valor ofensivo en el mismo mensaje (mismo criterio que
// src/blocking/options.ts).
const generateRawSchema = z.strictObject({
  'database-url': z.string().min(1),
  rows: z.string().min(1),
  seed: z.string().min(1),
  'batch-size': z.string().min(1),
  // Corrección (validador, hallazgo NOTE): --anchor debe ser una fecha/hora
  // ISO válida — un valor cualquiera pasaba antes con solo "no vacío", y
  // acababa en un `::timestamptz` de PostgreSQL que fallaría en tiempo de
  // ejecución en vez de en el parseo de argumentos (spec "CLI Argument
  // Validation": "before any I/O").
  anchor: z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'debe ser una fecha/hora ISO 8601 válida (p. ej. 2026-01-01T00:00:00.000Z)',
  }),
});

export function parseGenerateCorpusArgs(argv: readonly string[]): GenerateCorpusOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        'database-url': { type: 'string' },
        rows: { type: 'string' },
        seed: { type: 'string' },
        'batch-size': { type: 'string' },
        anchor: { type: 'string' },
        truncate: { type: 'boolean' },
      },
    });
  } catch (error) {
    // parseArgs({strict:true}) ya nombra el flag desconocido en su propio
    // mensaje (mismo criterio que parseCalibrationArgs).
    throw new GenerateCorpusOptionsError(error instanceof Error ? error.message : String(error));
  }

  const rawValues = parsed.values as {
    'database-url'?: string;
    rows?: string;
    seed?: string;
    'batch-size'?: string;
    anchor?: string;
    truncate?: boolean;
  };

  const candidate = {
    'database-url': rawValues['database-url'] ?? '',
    rows: rawValues.rows ?? String(DEFAULT_ROWS),
    seed: rawValues.seed ?? String(DEFAULT_SEED),
    'batch-size': rawValues['batch-size'] ?? String(DEFAULT_BATCH_SIZE),
    anchor: rawValues.anchor ?? new Date().toISOString(),
  };

  const result = generateRawSchema.safeParse(candidate);
  if (!result.success) {
    throw new GenerateCorpusOptionsError(
      `${flagNameFromIssue(result.error.issues[0])} inválido o ausente: ${result.error.issues[0]?.message ?? 'sin detalle'}.`
    );
  }

  return {
    databaseUrl: result.data['database-url'],
    rows: parsePositiveInt('--rows', result.data.rows, GenerateCorpusOptionsError),
    seed: parseInteger('--seed', result.data.seed, GenerateCorpusOptionsError),
    batchSize: parsePositiveInt('--batch-size', result.data['batch-size'], GenerateCorpusOptionsError),
    anchorIso: result.data.anchor,
    truncate: rawValues.truncate === true,
  };
}

// ---------------------------------------------------------------------------
// bench-search.ts (fase 2, tarea 2.7) — el parser vive aquí (fase 1) porque
// es lógica pura de validación de argumentos, igual que el resto de este
// fichero (diseño, tabla de ficheros: "both argument schemas, cold mode").
// ---------------------------------------------------------------------------

export class BenchSearchOptionsError extends Error {}

export interface BenchSearchOptions {
  readonly databaseUrl: string;
  readonly runs: number;
  readonly only: readonly BenchCombinationId[];
  readonly coldMode: ColdMode;
}

// Diseño decisión 7: por defecto 20 corridas cálidas, mínimo 10 (spec
// "Warm/Cold Run Statistics": ">=10 warm runs").
const DEFAULT_RUNS = 20;
const MIN_RUNS = 10;
const DEFAULT_COLD_MODE: ColdMode = 'evict';

const benchRawSchema = z.strictObject({
  'database-url': z.string().min(1),
  runs: z.string().min(1),
  'cold-mode': z.string().min(1),
});

export function parseBenchSearchArgs(argv: readonly string[]): BenchSearchOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        'database-url': { type: 'string' },
        runs: { type: 'string' },
        only: { type: 'string', multiple: true },
        'cold-mode': { type: 'string' },
      },
    });
  } catch (error) {
    throw new BenchSearchOptionsError(error instanceof Error ? error.message : String(error));
  }

  const rawValues = parsed.values as {
    'database-url'?: string;
    runs?: string;
    only?: readonly string[];
    'cold-mode'?: string;
  };

  const candidate = {
    'database-url': rawValues['database-url'] ?? '',
    runs: rawValues.runs ?? String(DEFAULT_RUNS),
    'cold-mode': rawValues['cold-mode'] ?? DEFAULT_COLD_MODE,
  };

  const result = benchRawSchema.safeParse(candidate);
  if (!result.success) {
    throw new BenchSearchOptionsError(
      `${flagNameFromIssue(result.error.issues[0])} inválido o ausente: ${result.error.issues[0]?.message ?? 'sin detalle'}.`
    );
  }

  const runs = parseInteger('--runs', result.data.runs, BenchSearchOptionsError);
  if (runs < MIN_RUNS) {
    throw new BenchSearchOptionsError(
      `--runs inválido: ${String(runs)} es menor que el mínimo de ${String(MIN_RUNS)} corridas cálidas (spec "Warm/Cold Run Statistics").`
    );
  }

  if (!isColdMode(result.data['cold-mode'])) {
    throw new BenchSearchOptionsError(
      `--cold-mode inválido: "${result.data['cold-mode']}" no es uno de ${COLD_MODES.join(', ')}.`
    );
  }
  const coldMode = result.data['cold-mode'];

  const rawOnly = rawValues.only ?? [];
  for (const id of rawOnly) {
    if (!isBenchCombinationId(id)) {
      throw new BenchSearchOptionsError(
        `--only inválido: "${id}" no es una combinación conocida (${BENCH_COMBINATION_IDS.join(', ')}).`
      );
    }
  }
  const only = rawOnly as readonly BenchCombinationId[];

  // Diseño decisión 8: `restart` solo tiene sentido acotado a UNA
  // combinación — cada invocación implica un `docker compose restart db`
  // manual del operador (fase 3), así que ejecutar la matriz completa en
  // modo restart sería 12 reinicios por corrida.
  if (coldMode === 'restart' && only.length !== 1) {
    throw new BenchSearchOptionsError(
      `--cold-mode restart exige exactamente un --only <id> (diseño decisión 8): se recibieron ${String(only.length)}.`
    );
  }

  return { databaseUrl: result.data['database-url'], runs, only, coldMode };
}

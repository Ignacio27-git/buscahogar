// ROADMAP 2.4 (search-indexing-performance) — bench-search.ts (diseño D4,
// decisiones 6, 7, 8 y 9; fase 2, tarea 2.7). Mide la consulta de producción
// de cada escenario según su `kind` (`buildPropertySearchQuery`,
// `buildMapPointsQuery` o `buildMapCountQuery` de `@buscahogar/db`) contra una base de datos de BANCO aislada — el mismo
// guard que `generate-search-corpus.ts` (diseño D4) corre ANTES de abrir
// ninguna conexión. Reutiliza `parseBenchSearchArgs` (bench-options.ts, fase
// 1, tarea 1.4) tal cual, sin volver a parsear argv (fase 2, tarea 2.7):
// este fichero NUNCA añade sus propios flags de línea de comandos. Mismo
// patrón argv/env/io que `scripts/generate-search-corpus.ts`, con la misma
// inyección de `createDbFn` para poder testear el orden guard→conexión sin
// PostgreSQL real (`test/bench-search.test.ts`).
import { mkdir, writeFile as writeFileAsync } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import type { Pool } from 'pg';

import { assertBenchDatabaseUrl, parseBenchSearchArgs } from '../src/bench/bench-options.js';
import type { BenchSearchOptions } from '../src/bench/bench-options.js';
import { percentile, summarizePlan } from '../src/bench/measure.js';
import type { PlanSummary } from '../src/bench/measure.js';
import { benchQuerySql, runBenchQuery } from '../src/bench/query-dispatch.js';
import { BENCH_COMBINATIONS } from '../src/bench/query-matrix.js';
import type { BenchCombination } from '../src/bench/query-matrix.js';
import { renderReport } from '../src/bench/report.js';
import type { BenchCombinationRun, BenchRun } from '../src/bench/report.js';

export interface BenchIo {
  log(line: string): void;
  writeFile(path: string, text: string): Promise<void>;
}

// Directorio de salida ATADO a la posición de este fichero (no al cwd del
// proceso), igual que `HASHES_EVALUATION_PATH` en
// `scripts/compare-dedup-strategies.ts` — coincide con `.gitignore`
// (`apps/ingestion/.gitignore`: "`.bench/`"), diseño decisión 9.
const BENCH_OUTPUT_DIR = fileURLToPath(new URL('../.bench/', import.meta.url));

export class EvictPreflightError extends Error {}

// Diseño decisión 8: "Preflight checks rolsuper and pg_available_extensions.
// If either fails, the run exits non-zero with a named error; it never
// falls back silently." rolsuper se comprueba PRIMERO y a solas — si ya
// falla, ni siquiera se consulta `pg_available_extensions` (el rol no podría
// crear la extensión de todas formas).
// Corrección (validador, hallazgo CRÍTICO): PostgreSQL 17 solo expone
// `pg_buffercache_evict(IN int)` — la forma sin argumentos usada antes NO
// EXISTE en PG17 (las formas evict-all/por-relación llegan en PG18). Tras
// crear la extensión, el preflight comprueba que esa firma concreta existe
// vía `to_regprocedure`, en vez de asumir que "instalada" implica "con la
// función que necesitamos": una extensión instalada pero desactualizada
// (versión antigua de pg_buffercache) fallaría en tiempo de medición, no en
// el preflight, si no se comprobara la firma explícitamente.
async function preflightEvict(pool: Pool): Promise<void> {
  const superuserResult = await pool.query<{ rolsuper: boolean }>('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
  if (superuserResult.rows[0]?.rolsuper !== true) {
    throw new EvictPreflightError(
      'bench-search: --cold-mode evict requiere un rol superusuario (rolsuper) para invocar pg_buffercache_evict(); usa --cold-mode restart si no dispones de uno (diseño decisión 8).'
    );
  }

  const extensionResult = await pool.query<{ name: string }>("SELECT name FROM pg_available_extensions WHERE name = 'pg_buffercache'");
  if (extensionResult.rows.length === 0) {
    throw new EvictPreflightError(
      'bench-search: --cold-mode evict requiere la extensión pg_buffercache disponible en el servidor (pg_available_extensions); usa --cold-mode restart si no está disponible (diseño decisión 8).'
    );
  }

  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_buffercache');

  const signatureResult = await pool.query<{ exists: boolean }>(
    "SELECT to_regprocedure('pg_buffercache_evict(integer)') IS NOT NULL AS exists"
  );
  if (signatureResult.rows[0]?.exists !== true) {
    throw new EvictPreflightError(
      'bench-search: la extensión pg_buffercache está instalada pero no expone pg_buffercache_evict(integer) (versión antigua). Ejecuta `ALTER EXTENSION pg_buffercache UPDATE;` en la base de datos de banco y vuelve a intentarlo, o usa --cold-mode restart (diseño decisión 8).'
    );
  }
}

// Corrección (validador, hallazgo CRÍTICO): reemplaza el inexistente
// `pg_buffercache_evict()` (evict-all, PG18) por una eliminación FILA A FILA
// vía `pg_buffercache_evict(bufferid)` — la única forma soportada en PG17 —
// acotada a los búferes de la base de datos ACTUAL (`reldatabase = ... AND
// current_database()`), para no vaciar de paso los búferes de otras bases de
// datos del mismo clúster (p. ej. la de desarrollo).
export async function evictBuffers(pool: Pick<Pool, 'query'>): Promise<void> {
  await pool.query(
    'SELECT count(*) FILTER (WHERE pg_buffercache_evict(bufferid)) ' +
      'FROM pg_buffercache ' +
      'WHERE reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())'
  );
}

// ROADMAP 2.6: `runBenchQuery`/`benchQuerySql` despachan por `kind` (lista,
// puntos del mapa o recuento) hacia la consulta de producción correspondiente.
// Metrica reportada = reloj de pared del CLIENTE (diseño decisión 6): "user-
// facing latency", nunca solo el "Execution Time" de EXPLAIN (que excluye
// planificación y transferencia de resultados).
async function timedExecution(db: Database, combination: BenchCombination): Promise<number> {
  const start = performance.now();
  await runBenchQuery(db, combination);
  return performance.now() - start;
}

// `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre el `.toSQL()` de la MISMA
// función de producción (diseño, "Data Flow"): la consulta medida es, por
// construcción, la que emite `packages/db/src/search.ts` o `search-map.ts` — nunca una
// reescrita a mano. Mismo patrón que
// `packages/db/test/blocking/blocking-plan.test.ts`: `.toSQL()` nunca
// ejecuta la consulta por sí solo, así que este EXPLAIN es una invocación
// aparte de `runBenchQuery`, no una reutilización del resultado
// ya awaited en `timedExecution`.
async function explainCombination(db: Database, pool: Pool, combination: BenchCombination): Promise<PlanSummary> {
  const { sql: queryText, params } = benchQuerySql(db, combination);
  const { rows } = await pool.query<{ 'QUERY PLAN': unknown }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryText}`, params);
  const rawPlan = rows[0]?.['QUERY PLAN'];
  const plan: unknown = typeof rawPlan === 'string' ? (JSON.parse(rawPlan) as unknown) : rawPlan;
  return summarizePlan(plan);
}

// Orden por combinación (diseño decisión 7): frío → 1 corrida de
// calentamiento DESCARTADA → N corridas cálidas → un único EXPLAIN.
async function measureCombination(
  db: Database,
  pool: Pool,
  combination: BenchCombination,
  options: BenchSearchOptions
): Promise<BenchCombinationRun> {
  if (options.coldMode === 'evict') {
    await evictBuffers(pool);
  }
  // Corrección (validador, hallazgo WARNING): en modo `restart` el pool se
  // crea justo tras `docker compose restart db`, así que la primera consulta
  // paga la conexión TCP y el arranque del backend — inflando la corrida en
  // frío con un coste que nada tiene que ver con los búferes compartidos. Un
  // `SELECT 1` sin cronometrar, en AMBOS modos, deja la conexión establecida
  // ANTES de medir, sin tocar ninguna página de tabla (no recalienta los
  // búferes recién vaciados en modo `evict`).
  await pool.query('SELECT 1');
  const coldMs = await timedExecution(db, combination);

  await timedExecution(db, combination); // calentamiento, resultado descartado a propósito.

  const warmSamples: number[] = [];
  for (let run = 0; run < options.runs; run += 1) {
    warmSamples.push(await timedExecution(db, combination));
  }

  const plan = await explainCombination(db, pool, combination);

  return {
    id: combination.id,
    description: combination.description,
    coldMethod: options.coldMode,
    p50Ms: percentile(warmSamples, 50),
    p95Ms: percentile(warmSamples, 95),
    coldMs,
    plan,
  };
}

function selectCombinations(options: BenchSearchOptions): readonly BenchCombination[] {
  if (options.only.length === 0) {
    return BENCH_COMBINATIONS;
  }
  return BENCH_COMBINATIONS.filter((combination) => options.only.includes(combination.id));
}

export async function runBench(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: BenchIo,
  // Inyección mínima (mismo espíritu que `runGenerate`, fase 1 tarea 1.8):
  // por defecto el `createDb` real, pero un test offline puede pasar un
  // fabricante falso para comprobar el orden guard→preflight→conexión sin
  // ninguna base de datos real.
  createDbFn: typeof createDb = createDb
): Promise<number> {
  let options: BenchSearchOptions;
  try {
    options = parseBenchSearchArgs(argv);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  try {
    assertBenchDatabaseUrl(options.databaseUrl, env.DATABASE_URL);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Guard de base de datos de banco rechazado.');
    return 2;
  }

  const { db, pool } = createDbFn(options.databaseUrl);
  try {
    if (options.coldMode === 'evict') {
      try {
        await preflightEvict(pool);
      } catch (error) {
        io.log(error instanceof Error ? error.message : 'Preflight de --cold-mode evict rechazado.');
        return 3;
      }
    }

    const combinations = selectCombinations(options);
    const results: BenchCombinationRun[] = [];
    for (const combination of combinations) {
      io.log(`bench-search: midiendo "${combination.id}" (${String(options.runs)} corridas cálidas, cold-mode=${options.coldMode})...`);
      results.push(await measureCombination(db, pool, combination, options));
    }

    const run: BenchRun = { generatedAt: new Date().toISOString(), combinations: results };
    const outputPath = `${BENCH_OUTPUT_DIR}run-${run.generatedAt.replace(/[:.]/g, '-')}.json`;
    await io.writeFile(outputPath, `${JSON.stringify(run, null, 2)}\n`);
    io.log(`bench-search: resultados escritos en ${outputPath}`);
    io.log(renderReport(results));

    return 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: BenchIo = {
    log: (line: string): void => {
      console.log(line);
    },
    writeFile: async (path: string, text: string): Promise<void> => {
      await mkdir(BENCH_OUTPUT_DIR, { recursive: true });
      await writeFileAsync(path, text, 'utf8');
    },
  };

  process.exitCode = await runBench(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/generate-search-corpus.ts y scripts/calibrate-blocking.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

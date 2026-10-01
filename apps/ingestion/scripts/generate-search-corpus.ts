// ROADMAP 2.4 (search-indexing-performance) — generate-search-corpus.ts
// (diseño D5, D7, "Load procedure"). Genera el corpus sintético (~1M
// `properties` por defecto) contra una base de datos de BANCO aislada —
// nunca la de desarrollo: `assertBenchDatabaseUrl` (bench-options.ts,
// diseño D4) se ejecuta ANTES de abrir ninguna conexión. Mismo patrón de
// entorno que scripts/calibrate-blocking.ts: recibe argv/env/io como
// parámetros, para que el fallo (y el éxito) se puedan testear sin tocar el
// proceso real — `main()` es el único llamador con `process.argv`/
// `process.env` reales. CERO peticiones a ninguna fuente externa (spec
// "Zero External Calls"): este fichero no importa nada de `src/sources/**`.
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import type { Pool } from 'pg';

import { assertBenchDatabaseUrl, parseGenerateCorpusArgs } from '../src/bench/bench-options.js';
import { buildCorpusBatch } from '../src/bench/corpus-sql.js';

export interface GenerateIo {
  log(line: string): void;
}

export class GenerateCorpusPreconditionError extends Error {}

// Dos fuentes sintéticas fijas (diseño, "Corpus Shape"): se upsertan UNA
// vez por ejecución, nunca por tanda — todas las tandas comparten los
// mismos dos ids de fuente.
async function upsertSource(pool: Pool, key: string, name: string, kind: 'api' | 'scrape'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sources (key, name, kind) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [key, name, kind]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`generate-search-corpus: no se pudo upsertar la fuente sintética "${key}".`);
  }
  return row.id;
}

async function upsertSyntheticSources(pool: Pool): Promise<readonly [string, string]> {
  const benchApiId = await upsertSource(pool, 'bench-api', 'Bench API', 'api');
  const benchScrapeId = await upsertSource(pool, 'bench-scrape', 'Bench Scrape', 'scrape');
  return [benchApiId, benchScrapeId];
}

// Refusal explícito de una `properties` no vacía (diseño D5): un `--truncate`
// que se aplicara siempre, en silencio, podría borrar por accidente un
// corpus ya cargado sobre el que el operador está calibrando índices (fase
// 3). Sin `--truncate`, esta situación es un error, nunca un vaciado tácito.
async function ensureCorpusPrecondition(pool: Pool, truncate: boolean): Promise<void> {
  const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM properties');
  const count = Number(result.rows[0]?.count ?? '0');
  if (count === 0) {
    return;
  }
  if (!truncate) {
    throw new GenerateCorpusPreconditionError(
      `generate-search-corpus: "properties" ya tiene ${String(count)} fila(s). Pasa --truncate si de verdad quieres vaciarla antes de generar (nunca ocurre por accidente).`
    );
  }
  await pool.query('TRUNCATE TABLE property_listings, listing_versions, listings, properties RESTART IDENTITY CASCADE');
}

export async function runGenerate(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: GenerateIo,
  // Inyección mínima (validador, hallazgo WARNING): por defecto el `createDb`
  // real de @buscahogar/db, pero un test offline puede pasar un fabricante
  // falso para comprobar, sin ninguna conexión real, que (a) el guard corre
  // ANTES de construir cualquier pool/cliente, y (b) la precondición de
  // "properties" no vacía se respeta. Mismo espíritu de DI que ya usa
  // src/sweep/sweep-runner.ts con PropertySource/SweepStore falsos.
  createDbFn: typeof createDb = createDb
): Promise<number> {
  let options: ReturnType<typeof parseGenerateCorpusArgs>;
  try {
    options = parseGenerateCorpusArgs(argv);
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

  const { pool } = createDbFn(options.databaseUrl);
  try {
    await ensureCorpusPrecondition(pool, options.truncate);
    const sourceIds = await upsertSyntheticSources(pool);

    // "Uses one dedicated PoolClient, because setseed is per session"
    // (diseño decisión 5): TODA la tanda (setseed, staging, las 4
    // inserciones) viaja por la MISMA conexión, dentro de UNA transacción
    // por tanda — nunca por `pool.query()` suelto, que podría repartir las
    // sentencias entre conexiones distintas del pool.
    const client = await pool.connect();
    try {
      await client.query('SET synchronous_commit = off');

      const totalBatches = Math.ceil(options.rows / options.batchSize);
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const rowsInThisBatch = Math.min(options.batchSize, options.rows - batchIndex * options.batchSize);
        const statements = buildCorpusBatch({
          seed: options.seed,
          batchIndex,
          // La última tanda puede ser más pequeña que options.batchSize —
          // se genera exactamente `options.rows` en total, nunca de más.
          batchSize: rowsInThisBatch,
          anchorIso: options.anchorIso,
          sourceIds,
        });

        await client.query('BEGIN');
        try {
          for (const statement of statements) {
            await client.query(statement.text, [...statement.values]);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }

        io.log(`generate-search-corpus: tanda ${String(batchIndex + 1)}/${String(totalBatches)} (${String(rowsInThisBatch)} propiedades) completada.`);
      }
    } finally {
      client.release();
    }

    // VACUUM no puede ejecutarse dentro de una transacción (documentación de
    // PostgreSQL): se lanza aquí, fuera de cualquier BEGIN/COMMIT, una vez
    // completadas todas las tandas (diseño decisión 5).
    io.log('generate-search-corpus: VACUUM (ANALYZE) sobre las 4 tablas del corpus...');
    await pool.query('VACUUM (ANALYZE) properties, listings, listing_versions, property_listings');

    io.log(`generate-search-corpus: corpus generado (${String(options.rows)} propiedades, seed=${String(options.seed)}).`);
    return 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: GenerateIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };

  process.exitCode = await runGenerate(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts y scripts/reprocess-dedup.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

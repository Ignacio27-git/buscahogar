// ROADMAP 2.4 (search-indexing-performance) — search-bench.db.test.ts
// (diseño decisión 10). A DIFERENCIA del resto de `test/db/**` (que exige
// DATABASE_URL y lanza si falta, D2 del paso 1.7), esta suite lee
// EXCLUSIVAMENTE `BENCH_DATABASE_URL` y se OMITE (`describe.skipIf`, nunca
// `describe.skip` incondicional) si no está definida — nunca debe poder
// tocar la base de desarrollo ni exigir que esté arriba para poder saltarse.
// Si `BENCH_DATABASE_URL` SÍ está definida, el guard (bench-options.ts,
// diseño D4) y la precondición de tabla vacía SÍ son obligatorios: un fallo
// aquí es un FALLO real, nunca un salto silencioso disfrazado de éxito.
import { createDb, listingVersions, properties } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertBenchDatabaseUrl } from '../../src/bench/bench-options.js';
import { runGenerate } from '../../scripts/generate-search-corpus.js';
import { truncateAll } from './helpers/db-client.js';

const BENCH_DATABASE_URL = process.env.BENCH_DATABASE_URL;
const GENERATED_ROWS = 20_000;
const SEED = 20240229;

async function countRows(
  db: Database,
  table: 'properties' | 'listings' | 'listing_versions' | 'property_listings'
): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM ${sql.identifier(table)}`);
  return result.rows[0]?.count ?? 0;
}

describe.skipIf(!BENCH_DATABASE_URL)('corpus sintético contra BENCH_DATABASE_URL (diseño decisión 10, tarea 1.7)', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(async () => {
    // Mismo guard que ambas CLIs (diseño D4): esta suite nunca debe poder
    // ejecutarse por accidente contra la base de desarrollo, aunque alguien
    // deje BENCH_DATABASE_URL apuntando mal en su .env local.
    assertBenchDatabaseUrl(BENCH_DATABASE_URL, process.env.DATABASE_URL);
    ({ db, pool } = createDb(BENCH_DATABASE_URL));

    const existingCount = await countRows(db, 'properties');
    if (existingCount !== 0) {
      throw new Error(
        `search-bench.db.test.ts: "properties" en BENCH_DATABASE_URL ya tiene ${String(existingCount)} fila(s). ` +
          'Esta suite NUNCA trunca al empezar (diseño decisión 10): usa una base de datos de banco dedicada y vacía ' +
          '(buscahogar_test_bench), nunca una compartida con datos previos.'
      );
    }

    const io = { log: (): void => {} };
    const exitCode = await runGenerate(
      ['--database-url', BENCH_DATABASE_URL, '--rows', String(GENERATED_ROWS), '--seed', String(SEED), '--batch-size', '5000'],
      process.env,
      io
    );
    if (exitCode !== 0) {
      throw new Error('search-bench.db.test.ts: runGenerate terminó con un código de salida distinto de cero.');
    }
  });

  afterAll(async () => {
    // Trunca ÚNICAMENTE la base de banco de este test (diseño decisión 10):
    // nunca puede alcanzar el corpus de 1M de buscahogar_bench ni la base de
    // desarrollo — son bases de datos físicamente distintas.
    await truncateAll(pool);
    await pool.end();
  });

  it('genera exactamente las filas solicitadas, con recuentos consistentes entre las 4 tablas', async () => {
    const propertyCount = await countRows(db, 'properties');
    expect(propertyCount).toBe(GENERATED_ROWS);

    const listingCount = await countRows(db, 'listings');
    expect(listingCount).toBeGreaterThanOrEqual(GENERATED_ROWS);

    const versionCount = await countRows(db, 'listing_versions');
    expect(versionCount).toBe(listingCount);

    const propertyListingCount = await countRows(db, 'property_listings');
    expect(propertyListingCount).toBe(listingCount);
  });

  it('como mucho una versión vigente (is_current) por anuncio', async () => {
    const offenders = await db
      .select({ listingId: listingVersions.listingId, total: sql<number>`count(*)`.mapWith(Number) })
      .from(listingVersions)
      .where(sql`${listingVersions.isCurrent}`)
      .groupBy(listingVersions.listingId)
      .having(sql`count(*) > 1`);
    expect(offenders).toHaveLength(0);
  });

  it('location_geography es consistente con location (columna generada: nunca nula cuando location SÍ tiene valor)', async () => {
    // Corrección (validador, hallazgo CRÍTICO): el diseño ("Corpus Shape")
    // asigna ~2% de ubicaciones NULL a propósito (spec "NULLs ... location
    // 2%"), así que exigir location_geography SIEMPRE no-nula contradecía
    // el propio diseño. `location_geography` es una columna GENERATED
    // ALWAYS AS (location::geography): lo único que debe comprobarse es que
    // nunca queda nula cuando `location` SÍ tiene valor.
    const [inconsistent] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(properties)
      .where(sql`${properties.location} IS NOT NULL AND ${properties.locationGeography} IS NULL`);
    expect(inconsistent?.total).toBe(0);

    // Banda tolerante (no exacta) sobre el ~2% de ubicaciones nulas: prueba
    // que el generador SÍ produce NULLs (no los produce todos, ni ninguno)
    // sin acoplar el test a la cifra exacta de una seed concreta.
    const [nullLocations] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(properties)
      .where(sql`${properties.location} IS NULL`);
    const nullShare = (nullLocations?.total ?? 0) / GENERATED_ROWS;
    expect(nullShare).toBeGreaterThan(0);
    expect(nullShare).toBeLessThan(0.06);
  });

  it('min_price_cents de cada propiedad es exactamente el precio mínimo real de sus anuncios', async () => {
    // Nombres literales y cualificados, NUNCA interpolación de columnas de
    // Drizzle en la proyección (mismo criterio documentado en
    // packages/db/src/search.ts:28-38: evita el "column reference is
    // ambiguous" que produciría `${properties.id}` aquí).
    const mismatches = await db.execute<{ id: string }>(sql`
      SELECT p.id
        FROM "properties" p
        JOIN "property_listings" pl ON pl.property_id = p.id
        JOIN "listing_versions" lv ON lv.listing_id = pl.listing_id AND lv.is_current
       GROUP BY p.id, p.min_price_cents
      HAVING p.min_price_cents IS DISTINCT FROM MIN(lv.price_cents)
    `);
    expect(mismatches.rows).toHaveLength(0);
  });

  it('la misma seed y el mismo volumen reproducen el mismo recuento y el mismo precio mínimo agregado', async () => {
    // Corpus pequeño e independiente del de arriba (diseño, spec "Same seed
    // reproduces the same corpus shape"): se trunca, se genera dos veces con
    // idéntica seed/volumen/anchor, y se comparan agregados baratos
    // (recuento y SUMA de min_price_cents) entre ambas corridas.
    await truncateAll(pool);
    const io = { log: (): void => {} };
    const smallRunArgs = [
      '--database-url',
      BENCH_DATABASE_URL as string,
      '--rows',
      '500',
      '--seed',
      '777',
      '--batch-size',
      '500',
      '--anchor',
      '2026-01-01T00:00:00.000Z',
    ];

    let exitCode = await runGenerate(smallRunArgs, process.env, io);
    expect(exitCode).toBe(0);
    const firstCount = await countRows(db, 'properties');
    const firstSum = await db.execute<{ total: number | null }>(sql`SELECT sum(min_price_cents)::bigint AS total FROM properties`);

    await truncateAll(pool);
    exitCode = await runGenerate(smallRunArgs, process.env, io);
    expect(exitCode).toBe(0);
    const secondCount = await countRows(db, 'properties');
    const secondSum = await db.execute<{ total: number | null }>(sql`SELECT sum(min_price_cents)::bigint AS total FROM properties`);

    expect(secondCount).toBe(firstCount);
    expect(secondSum.rows[0]?.total).toBe(firstSum.rows[0]?.total);
  });
});

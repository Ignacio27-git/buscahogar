// Verifica que la migración deja la base de datos exactamente en el estado
// que espera el resto de la aplicación: las 10 tablas del inventario
// (REQ-SCHEMA-01), la extensión PostGIS (REQ-MIG-01), el enum de
// `coverage_jobs` (REQ-SCHEMA-09) y el índice GiST sobre la columna
// geográfica generada (REQ-SCHEMA-07). No es "la tabla existe" por sí
// mismo: es la prueba de que la migración completa —extensión, tipos e
// índices incluidos, no solo las tablas— aplicó de verdad.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';

describeWithDb('esquema tras la migración', () => {
  let pool: Pool;

  beforeAll(() => {
    ({ pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('crea las 10 tablas del inventario de REQ-SCHEMA-01', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tableNames = rows.map((row) => row.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'coverage_jobs',
        'features',
        'listing_features',
        'listing_versions',
        'listings',
        'locations',
        'properties',
        'property_listings',
        'sources',
        'zones',
      ])
    );
  });

  it('instala la extensión postgis (REQ-MIG-01)', async () => {
    const { rows } = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'postgis'`
    );

    expect(rows).toHaveLength(1);
  });

  it('crea el tipo enumerado coverage_job_status (REQ-SCHEMA-09)', async () => {
    const { rows } = await pool.query<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typname = 'coverage_job_status'`
    );

    expect(rows).toHaveLength(1);
  });

  it('indexa location_geography con GiST en listings y properties (REQ-SCHEMA-07)', async () => {
    const { rows } = await pool.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes
       WHERE indexname IN ('listings_location_geography_idx', 'properties_location_geography_idx')
       ORDER BY tablename`
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.indexdef).toContain('USING gist');
      expect(row.indexdef).toContain('location_geography');
    }
  });
});

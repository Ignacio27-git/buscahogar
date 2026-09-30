// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — migración 0015: la
// cola transitoria `listing_presence_checks` y `coverage_jobs.cycle_started_at`.
// Contra PostgreSQL real.
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { listingPresenceChecks, zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertLocation, insertSource } from '../helpers/fixtures.js';

async function insertZone(db: Database): Promise<string> {
  const locationId = await insertLocation(db);
  const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

describeWithDb('migración 0015 — cola de verificación de presencia y cycle_started_at', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('listing_presence_checks tiene las columnas del diseño con sus nulabilidades y defaults', async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_name = 'listing_presence_checks'
        order by column_name`
    );
    const byName = new Map(rows.map((row) => [row.column_name, row]));

    expect([...byName.keys()].sort()).toEqual([
      'check_attempts',
      'last_checked_at',
      'listing_id',
      'suspected_at',
      'zone_id',
    ]);
    expect(byName.get('listing_id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(byName.get('zone_id')).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(byName.get('suspected_at')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'NO' });
    expect(byName.get('last_checked_at')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expect(byName.get('check_attempts')).toMatchObject({ data_type: 'integer', is_nullable: 'NO', column_default: '0' });
  });

  it('una fila nueva nace con check_attempts = 0, last_checked_at NULL y suspected_at = ahora', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const zoneId = await insertZone(db);

    await db.insert(listingPresenceChecks).values({ listingId, zoneId });

    const { rows } = await pool.query<{ check_attempts: number; last_checked_at: Date | null; fresh: boolean }>(
      `select check_attempts, last_checked_at, (suspected_at > now() - interval '1 minute') as fresh
         from listing_presence_checks`
    );
    expect(rows).toEqual([{ check_attempts: 0, last_checked_at: null, fresh: true }]);
  });

  it('como mucho una fila por listing (clave primaria): un segundo INSERT del mismo listing falla con 23505', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const zoneId = await insertZone(db);
    await db.insert(listingPresenceChecks).values({ listingId, zoneId });

    await expect(db.insert(listingPresenceChecks).values({ listingId, zoneId })).rejects.toMatchObject({
      cause: { code: '23505' },
    });
  });

  it('borrar el listing borra su fila de la cola (ON DELETE CASCADE): es trabajo transitorio', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const zoneId = await insertZone(db);
    await db.insert(listingPresenceChecks).values({ listingId, zoneId });

    await db.execute(sql`delete from listings where id = ${listingId}`);

    const { rows } = await pool.query<{ total: string }>('select count(*) as total from listing_presence_checks');
    expect(rows[0]?.total).toBe('0');
  });

  it('coverage_jobs.cycle_started_at es timestamptz NULLABLE sin default (jobs previos: sin ciclo conocido)', async () => {
    const { rows } = await pool.query<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `select data_type, is_nullable, column_default from information_schema.columns
        where table_name = 'coverage_jobs' and column_name = 'cycle_started_at'`
    );

    expect(rows[0]).toEqual({ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null });
  });
});

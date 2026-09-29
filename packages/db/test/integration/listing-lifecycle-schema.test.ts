// ROADMAP 2.5 (refresh-retention-policy, S2; decisión 106) — columnas de ciclo
// de vida de `listings` (`inactive_since`, `inactive_reason`) y la caché de
// visibilidad `properties.active_listing_count`, más el backfill de la
// migración 0014 (S-PS-11). Contra PostgreSQL real.
import { readdirSync, readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { listings, properties } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

const migrationsDir = new URL('../../migrations/', import.meta.url);

// Sentencia de backfill de la migración 0014, leída del propio fichero SQL
// para que el test ejercite el SQL que realmente se aplica.
function readBackfillStatement(): string {
  const file = readdirSync(migrationsDir).find((name) => name.startsWith('0014_'));
  if (!file) {
    throw new Error('No existe la migración 0014');
  }
  const statement = readFileSync(new URL(file, migrationsDir), 'utf8')
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .find((part) => /UPDATE\s+"properties"/i.test(part));
  if (!statement) {
    throw new Error('La migración 0014 no contiene el backfill de active_listing_count');
  }
  return statement;
}

describeWithDb('migración 0014 — ciclo de vida de listings y caché de visibilidad (S-PS-11)', () => {
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

  it('un listing nuevo nace activo, con inactive_since e inactive_reason NULL', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);

    const [row] = await db.select().from(listings);
    expect(row?.id).toBe(listingId);
    expect(row?.status).toBe('active');
    expect(row?.inactiveSince).toBeNull();
    expect(row?.inactiveReason).toBeNull();
  });

  it.each(['delisted', 'zone_purged'])('acepta inactive_reason = %s', async (reason) => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId, {
      status: 'inactive',
      inactiveSince: new Date(),
      inactiveReason: reason,
    });

    const { rows } = await pool.query<{ inactive_reason: string }>(
      'select inactive_reason from listings where id = $1',
      [listingId]
    );
    expect(rows[0]?.inactive_reason).toBe(reason);
  });

  it('rechaza un inactive_reason fuera del catálogo (CHECK, 23514)', async () => {
    const sourceId = await insertSource(db);
    await expect(insertListing(db, sourceId, { inactiveReason: 'otra-cosa' })).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });

  it('properties.active_listing_count es entero NOT NULL con DEFAULT 0', async () => {
    const { rows } = await pool.query<{ data_type: string; is_nullable: string; column_default: string }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_name = 'properties' and column_name = 'active_listing_count'`
    );
    expect(rows[0]).toEqual({ data_type: 'integer', is_nullable: 'NO', column_default: '0' });

    const [property] = await db.insert(properties).values({}).returning();
    expect(property?.activeListingCount).toBe(0);
  });

  it('el backfill iguala active_listing_count a listing_count en cada vivienda y es idempotente', async () => {
    await db.insert(properties).values([{ listingCount: 3 }, { listingCount: 1 }, { listingCount: 0 }]);

    await db.execute(sql.raw(readBackfillStatement()));
    await db.execute(sql.raw(readBackfillStatement()));

    const rows = await db.select().from(properties);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.activeListingCount).toBe(row.listingCount);
    }
  });
});

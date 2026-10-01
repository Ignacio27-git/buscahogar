// ROADMAP 2.5 (refresh-retention-policy, S4; decisión 107) — tombstone de
// anuncios inactivos a los 180 días: UPDATE de redacción (descripción y `raw`
// de TODAS las versiones y `thumbnail_url`), `status = 'removed'` y
// `tombstoned_at`. Conserva la fila del anuncio, el historial de precios, las
// puntuaciones con su desglose y toda la evidencia de deduplicación: nada se
// borra y ninguna FK en cascada se dispara. Contra PostgreSQL real.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { tombstoneExpiredListings } from '../../src/tombstone.js';
import {
  dedupPairEvidence,
  dedupRuns,
  listings,
  listingVersions,
  properties,
  propertyListings,
} from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

const RETENTION_DAYS = 180;
const BATCH_SIZE = 500;

describeWithDb('tombstoneExpiredListings — redacción a los 180 días (S-RP-12..18, decisión 107)', () => {
  let db: Database;
  let pool: Pool;
  let sourceId: string;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    sourceId = await insertSource(db);
  });

  // Anuncio inactivo hace `inactiveInterval` (intervalo de Postgres, p. ej.
  // '180 days'), con dos versiones con descripción y `raw`, y miniatura.
  async function inactiveListing(inactiveInterval: string, reason = 'delisted'): Promise<string> {
    const listingId = await insertListing(db, sourceId, { thumbnailUrl: 'https://cdn.example.test/foto.jpg' });
    await pool.query(
      `update listings set status = 'inactive', inactive_reason = $2, inactive_since = now() - $3::interval where id = $1`,
      [listingId, reason, inactiveInterval]
    );
    await pool.query(
      `insert into listing_versions (listing_id, version, is_current, price_cents, title, description, address, operation, raw, captured_at)
       values ($1, 1, false, 100000, 'Piso céntrico', 'Contacta con Ana García 600000000', 'Calle Mayor 1', 'sale', '{"contactInfo":{"phone":"600000000"}}'::jsonb, now() - interval '300 days'),
              ($1, 2, true, 90000, 'Piso céntrico', 'Contacta con Ana García 600000000', 'Calle Mayor 1', 'sale', '{"contactInfo":{"phone":"600000000"}}'::jsonb, now() - interval '250 days')`,
      [listingId]
    );
    return listingId;
  }

  async function readListing(id: string): Promise<typeof listings.$inferSelect> {
    const [row] = await db.select().from(listings).where(eq(listings.id, id));
    if (!row) {
      throw new Error('anuncio no encontrado');
    }
    return row;
  }

  async function count(table: string): Promise<number> {
    const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from ${table}`);
    return Number(rows[0]?.n);
  }

  function tombstone(): ReturnType<typeof tombstoneExpiredListings> {
    return tombstoneExpiredListings(db, { retentionDays: RETENTION_DAYS, batchSize: BATCH_SIZE });
  }

  it('S-RP-12: exactamente 180 días inactivo se retira (<=); 179 días 23 horas no', async () => {
    const exact = await inactiveListing('180 days');
    const almost = await inactiveListing('179 days 23 hours');

    const tombstoned = await tombstone();

    expect(tombstoned).toBe(1);
    expect((await readListing(exact)).status).toBe('removed');
    expect((await readListing(exact)).tombstonedAt).toBeInstanceOf(Date);
    const untouched = await readListing(almost);
    expect(untouched.status).toBe('inactive');
    expect(untouched.tombstonedAt).toBeNull();
    expect(untouched.thumbnailUrl).toBe('https://cdn.example.test/foto.jpg');
  });

  it('S-RP-13: redacta descripción y raw de TODAS las versiones y la miniatura; conserva identidad, estado de origen y precios', async () => {
    const id = await inactiveListing('200 days', 'zone_purged');
    const before = await readListing(id);

    await tombstone();

    const after = await readListing(id);
    expect(after.thumbnailUrl).toBeNull();
    expect(after.sourceId).toBe(before.sourceId);
    expect(after.externalId).toBe(before.externalId);
    expect(after.url).toBe(before.url);
    expect(after.inactiveReason).toBe('zone_purged');
    expect(after.inactiveSince).toEqual(before.inactiveSince);
    const versions = await db.select().from(listingVersions).where(eq(listingVersions.listingId, id));
    expect(versions).toHaveLength(2);
    for (const version of versions) {
      expect(version.description).toBeNull();
      expect(version.raw).toBeNull();
    }
    expect(versions.map((v) => v.priceCents).sort((x, y) => x - y)).toEqual([90_000, 100_000]);
    expect(versions.map((v) => v.title)).toEqual(['Piso céntrico', 'Piso céntrico']);
    expect(versions.map((v) => v.address)).toEqual(['Calle Mayor 1', 'Calle Mayor 1']);
  });

  it('S-RP-14: property_listings (puntuación y desglose), dedup_pair_evidence y dedup_runs quedan idénticos', async () => {
    const a = await inactiveListing('200 days');
    const b = await inactiveListing('10 days');
    const [low, high] = a < b ? [a, b] : [b, a];
    const [property] = await db
      .insert(properties)
      .values({ minPriceCents: 90_000, listingCount: 2, activeListingCount: 0 })
      .returning({ id: properties.id });
    if (!property) {
      throw new Error('vivienda no insertada');
    }
    for (const listingId of [a, b]) {
      await db.insert(propertyListings).values({
        propertyId: property.id,
        listingId,
        score: 0.87,
        strategyName: 'test',
        strategyVersion: '1',
        signals: { price: { value: 0.9, weight: 0.6 }, surface: { value: 0.8, weight: 0.4 } },
      });
    }
    const [run] = await db
      .insert(dedupRuns)
      .values({
        strategyName: 'test',
        strategyVersion: '1',
        radiusMeters: 100,
        priceBandCents: 1000,
        surfaceToleranceM2: 5,
        listingsConsidered: 2,
        candidatePairs: 1,
        acceptPairs: 1,
        undecidedPairs: 0,
        rejectPairs: 0,
        propertiesCreated: 1,
        refusedComponents: 0,
      })
      .returning({ id: dedupRuns.id });
    if (!run) {
      throw new Error('ejecución no insertada');
    }
    await db
      .insert(dedupPairEvidence)
      .values({ runId: run.id, listingAId: low, listingBId: high, score: 0.87, signals: { price: { value: 0.9, weight: 0.6 } }, band: 'accept' });
    const snapshot = async (): Promise<unknown> => ({
      links: await db.select().from(propertyListings).orderBy(propertyListings.listingId),
      evidence: await db.select().from(dedupPairEvidence),
      runs: await db.select().from(dedupRuns),
      prices: (await db.select().from(listingVersions)).map((v) => [v.id, v.priceCents, v.capturedAt]).sort(),
    });
    const before = await snapshot();

    expect(await tombstone()).toBe(1);

    expect(await snapshot()).toEqual(before);
  });

  it('S-RP-15: ningún recuento de listings, versiones o property_listings disminuye', async () => {
    await inactiveListing('200 days');
    await inactiveListing('300 days');
    const before = [await count('listings'), await count('listing_versions'), await count('property_listings')];

    await tombstone();

    expect([await count('listings'), await count('listing_versions'), await count('property_listings')]).toEqual(before);
  });

  it('un anuncio activo, o inactivo hace poco, no se toca', async () => {
    const active = await insertListing(db, sourceId, { thumbnailUrl: 'https://cdn.example.test/a.jpg' });
    const recent = await inactiveListing('30 days');

    expect(await tombstone()).toBe(0);

    expect((await readListing(active)).thumbnailUrl).toBe('https://cdn.example.test/a.jpg');
    expect((await readListing(recent)).status).toBe('inactive');
  });

  it('S-RP-17: una segunda ejecución no hace nada y no repite la redacción', async () => {
    await inactiveListing('200 days');

    const first = await tombstone();
    const stamp = (await db.select().from(listings))[0]?.tombstonedAt;
    const second = await tombstone();

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect((await db.select().from(listings))[0]?.tombstonedAt).toEqual(stamp);
  });

  it('S-RP-18: con 1.200 elegibles, una pasada procesa como mucho 500', async () => {
    await pool.query(
      `insert into listings (source_id, external_id, url, status, inactive_reason, inactive_since, thumbnail_url)
       select $1, 'bulk-' || g, 'https://example.test/' || g, 'inactive', 'delisted', now() - interval '200 days', 'https://cdn.example.test/' || g
         from generate_series(1, 1200) g`,
      [sourceId]
    );

    const first = await tombstone();
    const second = await tombstone();
    const third = await tombstone();

    expect([first, second, third]).toEqual([500, 500, 200]);
    expect(await count('listings')).toBe(1200);
  });

  it('migración 0016: columna tombstoned_at nullable e índice parcial de candidatos', async () => {
    const column = await pool.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns where table_name = 'listings' and column_name = 'tombstoned_at'`
    );
    const index = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'listings_tombstone_candidates_idx'`
    );

    expect(column.rows).toEqual([{ is_nullable: 'YES' }]);
    expect(index.rows[0]?.indexdef).toContain("status = 'inactive'");
    expect(index.rows[0]?.indexdef).toContain('tombstoned_at IS NULL');
  });
});

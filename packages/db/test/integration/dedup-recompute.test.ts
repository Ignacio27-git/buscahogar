// REQ-SCHEMA-12: reprocesar la deduplicación (borrar y recrear las
// decisiones de `property_listings`) nunca debe tocar `listings` ni
// `listing_versions` — es precisamente lo que permite recalcular sin volver
// a gastar cuota de la API (CLAUDE.md, decisión 002).
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import type { SignalBreakdown } from '../../src/types.js';
import { listingVersions, properties, propertyListings } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

describeWithDb('recomputar property_listings sin tocar la identidad del anuncio', () => {
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

  it('borrar y recrear N decisiones deja intactos los recuentos de listings y listing_versions', async () => {
    const sourceId = await insertSource(db);
    const listingIds = await Promise.all([
      insertListing(db, sourceId),
      insertListing(db, sourceId),
      insertListing(db, sourceId),
    ]);
    for (const listingId of listingIds) {
      await db.insert(listingVersions).values({
        listingId,
        version: 1,
        isCurrent: true,
        priceCents: 150_000_00,
        operation: 'sale',
      });
    }
    const [property] = await db.insert(properties).values({}).returning({ id: properties.id });
    if (!property) {
      throw new Error('No se pudo insertar la vivienda de prueba');
    }

    const signals: SignalBreakdown = { exactAddress: { value: 1, weight: 1 } };
    const buildRows = (): (typeof propertyListings.$inferInsert)[] =>
      listingIds.map((listingId) => ({
        propertyId: property.id,
        listingId,
        score: 0.8,
        strategyName: 'address-proximity',
        strategyVersion: '1.0.0',
        signals,
      }));

    await db.insert(propertyListings).values(buildRows());

    const countsBefore = await countIdentityRows(pool);
    expect(countsBefore.listings).toBe(3);
    expect(countsBefore.listingVersions).toBe(3);

    // Recomputar: se borran TODAS las decisiones y se recrean contra los
    // mismos anuncios, como haría una nueva pasada de la estrategia de
    // deduplicación (`DedupStrategy`).
    await db.delete(propertyListings);
    await db.insert(propertyListings).values(buildRows());

    const countsAfter = await countIdentityRows(pool);
    expect(countsAfter.listings).toBe(countsBefore.listings);
    expect(countsAfter.listingVersions).toBe(countsBefore.listingVersions);

    const remainingDecisions = await db.select().from(propertyListings);
    expect(remainingDecisions).toHaveLength(3);
  });
});

async function countIdentityRows(
  pool: Pool
): Promise<{ listings: number; listingVersions: number }> {
  const { rows } = await pool.query<{ listings: string; listing_versions: string }>(
    `SELECT
       (SELECT count(*) FROM listings) AS listings,
       (SELECT count(*) FROM listing_versions) AS listing_versions`
  );
  const row = rows[0];
  if (!row) {
    throw new Error('No se pudo contar listings/listing_versions');
  }
  return { listings: Number(row.listings), listingVersions: Number(row.listing_versions) };
}

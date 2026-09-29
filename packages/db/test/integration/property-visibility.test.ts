// ROADMAP 2.5 (refresh-retention-policy, S2; decisión 109) — caché de
// visibilidad de `properties` mantenida por `refreshPropertyVisibility`:
// recuento de anuncios activos y precio mínimo entre los ACTIVOS (con
// fallback al mínimo de todos cuando ninguno lo está). Contra PostgreSQL real.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { listings, listingVersions, properties, propertyListings } from '../../src/tables.js';
import { refreshPropertyVisibility } from '../../src/visibility.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListingWithCurrentVersion, insertSource } from '../helpers/fixtures.js';

async function insertProperty(db: Database, listingIds: readonly string[], minPriceCents = 999): Promise<string> {
  const [property] = await db
    .insert(properties)
    .values({ minPriceCents, listingCount: listingIds.length, activeListingCount: listingIds.length })
    .returning({ id: properties.id });
  if (!property) {
    throw new Error('No se pudo insertar la vivienda de prueba');
  }
  for (const listingId of listingIds) {
    await db.insert(propertyListings).values({
      propertyId: property.id,
      listingId,
      score: 1,
      strategyName: 'test',
      strategyVersion: '1',
      signals: {},
    });
  }
  return property.id;
}

async function readProperty(db: Database, id: string): Promise<{ count: number; price: number | null }> {
  const [row] = await db.select().from(properties).where(eq(properties.id, id));
  if (!row) {
    throw new Error('vivienda no encontrada');
  }
  return { count: row.activeListingCount, price: row.minPriceCents };
}

async function setStatus(db: Database, listingId: string, status: string): Promise<void> {
  await db
    .update(listings)
    .set({ status, ...(status === 'inactive' ? { inactiveSince: new Date(), inactiveReason: 'delisted' } : {}) })
    .where(eq(listings.id, listingId));
}

describeWithDb('refreshPropertyVisibility — activos y precio mínimo (S-PS-1..4, S-PS-7)', () => {
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

  async function listing(priceCents: number, status = 'active'): Promise<string> {
    const { listingId } = await insertListingWithCurrentVersion(db, sourceId, { priceCents, status });
    return listingId;
  }

  it('S-PS-1: A activo 900 y B inactivo 700 -> visible con precio 900', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const propertyId = await insertProperty(db, [a, b], 700);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 1, price: 900 });
  });

  it('S-PS-3: A activo 900 y B activo 700 -> precio 700, dos activos', async () => {
    const a = await listing(900);
    const b = await listing(700);
    const propertyId = await insertProperty(db, [a, b], 900);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 2, price: 700 });
  });

  it('S-PS-2: todos inactivos -> recuento 0 y precio = mínimo de todos (solo alcanzable desde el detalle)', async () => {
    const a = await listing(900, 'inactive');
    const b = await listing(700, 'inactive');
    const propertyId = await insertProperty(db, [a, b], 1);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 0, price: 700 });
  });

  it("un anuncio 'removed' tampoco cuenta como activo", async () => {
    const a = await listing(900);
    const b = await listing(100, 'removed');
    const propertyId = await insertProperty(db, [a, b], 100);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 1, price: 900 });
  });

  it('S-PS-4: B inactivo y reactivado -> precio y visibilidad recalculados; property_listings intacto', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const propertyId = await insertProperty(db, [a, b], 700);
    const linksBefore = await db.select().from(propertyListings);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });
    expect(await readProperty(db, propertyId)).toEqual({ count: 1, price: 900 });

    await setStatus(db, b, 'active');
    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 2, price: 700 });
    expect(await db.select().from(propertyListings)).toEqual(linksBefore);
  });

  it('solo cuentan las versiones VIGENTES: una versión antigua más barata no fija el precio', async () => {
    const a = await listing(900);
    await db.update(listingVersions).set({ isCurrent: false }).where(eq(listingVersions.listingId, a));
    await db.insert(listingVersions).values({
      listingId: a,
      version: 2,
      isCurrent: true,
      priceCents: 950,
      operation: 'sale',
    });
    const propertyId = await insertProperty(db, [a], 1);

    await refreshPropertyVisibility(db, { propertyIds: [propertyId] });

    // La versión 1 (900, ya no vigente) es más barata que la vigente (950).
    expect(await readProperty(db, propertyId)).toEqual({ count: 1, price: 950 });
  });

  it('el alcance por listingIds resuelve la vivienda a través de property_listings', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const propertyId = await insertProperty(db, [a, b], 700);

    await refreshPropertyVisibility(db, { listingIds: [b] });

    expect(await readProperty(db, propertyId)).toEqual({ count: 1, price: 900 });
  });

  it('no toca viviendas fuera del alcance ni updated_at de las tocadas', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const inScope = await insertProperty(db, [a, b], 700);
    const c = await listing(500, 'inactive');
    const outOfScope = await insertProperty(db, [c], 12345);
    const [before] = await db.select().from(properties).where(eq(properties.id, inScope));

    const touched = await refreshPropertyVisibility(db, { propertyIds: [inScope] });

    expect(touched).toBe(1);
    expect(await readProperty(db, outOfScope)).toEqual({ count: 1, price: 12345 });
    const [after] = await db.select().from(properties).where(eq(properties.id, inScope));
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });

  it('es idempotente: una segunda ejecución no modifica ninguna fila', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const propertyId = await insertProperty(db, [a, b], 700);

    expect(await refreshPropertyVisibility(db, { propertyIds: [propertyId] })).toBe(1);
    expect(await refreshPropertyVisibility(db, { propertyIds: [propertyId] })).toBe(0);
  });

  it('el alcance all recalcula todas las viviendas', async () => {
    const a = await listing(900);
    const b = await listing(700, 'inactive');
    const first = await insertProperty(db, [a, b], 700);
    const c = await listing(500, 'inactive');
    const second = await insertProperty(db, [c], 500);

    expect(await refreshPropertyVisibility(db, { all: true })).toBe(2);

    expect(await readProperty(db, first)).toEqual({ count: 1, price: 900 });
    expect(await readProperty(db, second)).toEqual({ count: 0, price: 500 });
  });

  it('un alcance vacío es un no-op (0 filas, sin error)', async () => {
    expect(await refreshPropertyVisibility(db, { propertyIds: [] })).toBe(0);
    expect(await refreshPropertyVisibility(db, { listingIds: [] })).toBe(0);
  });
});

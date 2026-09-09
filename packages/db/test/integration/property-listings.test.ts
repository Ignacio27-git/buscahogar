// REQ-SCHEMA-04, REQ-SCHEMA-05, REQ-SCHEMA-06, REQ-SCHEMA-10: la tabla de
// evidencia de deduplicación. Un anuncio como mucho apunta a una vivienda
// canónica, la evidencia completa (puntuación, estrategia y desglose por
// señal) se lee entera, y una versión nueva del anuncio no invalida la
// decisión ya tomada.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import type { SignalBreakdown } from '../../src/types.js';
import { listingVersions, properties, propertyListings } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

describeWithDb('property_listings: evidencia de deduplicación', () => {
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

  it('UNIQUE(listing_id) rechaza que el mismo anuncio se ate a una segunda vivienda (REQ-SCHEMA-06)', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const [propertyA] = await db.insert(properties).values({}).returning({ id: properties.id });
    const [propertyB] = await db.insert(properties).values({}).returning({ id: properties.id });
    if (!propertyA || !propertyB) {
      throw new Error('No se pudieron insertar las viviendas de prueba');
    }

    const signals: SignalBreakdown = {
      exactAddress: { value: 1, weight: 0.7, detail: 'misma dirección exacta' },
    };
    await db.insert(propertyListings).values({
      propertyId: propertyA.id,
      listingId,
      score: 0.95,
      strategyName: 'address-proximity',
      strategyVersion: '1.0.0',
      signals,
    });

    let caught: unknown;
    try {
      await db.insert(propertyListings).values({
        propertyId: propertyB.id,
        listingId,
        score: 0.5,
        strategyName: 'address-proximity',
        strategyVersion: '1.0.0',
        signals,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe('23505');
  });

  it('lee de vuelta la puntuación, la estrategia y el desglose completo por señal (REQ-SCHEMA-04)', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const [property] = await db.insert(properties).values({}).returning({ id: properties.id });
    if (!property) {
      throw new Error('No se pudo insertar la vivienda de prueba');
    }

    const signals: SignalBreakdown = {
      exactAddress: { value: 1, weight: 0.6, detail: 'misma dirección exacta' },
      priceProximity: { value: 0.92, weight: 0.3 },
      surfaceMargin: { value: 0.8, weight: 0.1, detail: 'superficie dentro del margen' },
    };

    await db.insert(propertyListings).values({
      propertyId: property.id,
      listingId,
      score: 0.87,
      strategyName: 'address-proximity',
      strategyVersion: '1.2.0',
      signals,
    });

    const [row] = await db
      .select()
      .from(propertyListings)
      .where(eq(propertyListings.listingId, listingId));

    expect(row?.score).toBe(0.87);
    expect(row?.strategyName).toBe('address-proximity');
    expect(row?.strategyVersion).toBe('1.2.0');
    // El desglose se lee ENTERO, no solo la decisión final: las tres señales
    // deben seguir presentes, con su peso y su detalle (CLAUDE.md).
    expect(row?.signals).toEqual(signals);
  });

  it('una versión nueva del anuncio deja intacta la decisión existente (REQ-SCHEMA-05)', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);
    const [property] = await db.insert(properties).values({}).returning({ id: properties.id });
    if (!property) {
      throw new Error('No se pudo insertar la vivienda de prueba');
    }
    await db.insert(listingVersions).values({
      listingId,
      version: 1,
      isCurrent: true,
      priceCents: 200_000_00,
      operation: 'sale',
    });

    const signals: SignalBreakdown = { exactAddress: { value: 1, weight: 1 } };
    const [inserted] = await db
      .insert(propertyListings)
      .values({
        propertyId: property.id,
        listingId,
        score: 0.99,
        strategyName: 'address-proximity',
        strategyVersion: '1.0.0',
        signals,
      })
      .returning();
    if (!inserted) {
      throw new Error('No se pudo insertar la decisión de prueba');
    }

    // Llega una versión nueva (cambio de precio): la versión anterior deja
    // de ser la vigente (el índice único parcial exige exactamente una), y
    // la identidad del anuncio no cambia, así que el FK de
    // property_listings sigue apuntando al mismo sitio.
    await db
      .update(listingVersions)
      .set({ isCurrent: false })
      .where(eq(listingVersions.listingId, listingId));
    await db.insert(listingVersions).values({
      listingId,
      version: 2,
      isCurrent: true,
      priceCents: 190_000_00,
      operation: 'sale',
    });

    const [afterNewVersion] = await db
      .select()
      .from(propertyListings)
      .where(eq(propertyListings.listingId, listingId));

    expect(afterNewVersion?.id).toBe(inserted.id);
    expect(afterNewVersion?.propertyId).toBe(property.id);
    expect(afterNewVersion?.score).toBe(0.99);
    expect(afterNewVersion?.signals).toEqual(signals);
  });

  it('el precio consolidado de la vivienda es el más económico del grupo (REQ-SCHEMA-10)', async () => {
    const sourceId = await insertSource(db);
    const listingA = await insertListing(db, sourceId);
    const listingB = await insertListing(db, sourceId);
    const [property] = await db.insert(properties).values({}).returning({ id: properties.id });
    if (!property) {
      throw new Error('No se pudo insertar la vivienda de prueba');
    }

    await db.insert(listingVersions).values({
      listingId: listingA,
      version: 1,
      isCurrent: true,
      priceCents: 200_000_00,
      operation: 'sale',
    });
    await db.insert(listingVersions).values({
      listingId: listingB,
      version: 1,
      isCurrent: true,
      priceCents: 180_000_00,
      operation: 'sale',
    });

    const signals: SignalBreakdown = { exactAddress: { value: 1, weight: 1 } };
    await db.insert(propertyListings).values([
      {
        propertyId: property.id,
        listingId: listingA,
        score: 0.9,
        strategyName: 'address-proximity',
        strategyVersion: '1.0.0',
        signals,
      },
      {
        propertyId: property.id,
        listingId: listingB,
        score: 0.9,
        strategyName: 'address-proximity',
        strategyVersion: '1.0.0',
        signals,
      },
    ]);

    // El precio consolidado no es un campo de aplicación en este paquete
    // (es una caché que recalcula la Fase de deduplicación, decisión 006):
    // aquí se comprueba que el ESQUEMA permite resolverlo correctamente vía
    // los FKs y el filtro `is_current`, no un valor fijo simulado.
    const { rows } = await pool.query<{ min_price_cents: string }>(
      `SELECT MIN(lv.price_cents) AS min_price_cents
       FROM property_listings pl
       JOIN listings l ON l.id = pl.listing_id
       JOIN listing_versions lv ON lv.listing_id = l.id AND lv.is_current
       WHERE pl.property_id = $1`,
      [property.id]
    );

    expect(Number(rows[0]?.min_price_cents)).toBe(180_000_00);
  });
});

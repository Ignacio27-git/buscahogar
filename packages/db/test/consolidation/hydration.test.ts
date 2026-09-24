// ROADMAP 1.10 (diseño D7) — RED primero: `hydrateListingsForDedup` no
// existe todavía. Respaldada por PostgreSQL real, con su propia config
// fail-loud (vitest.consolidation.config.ts, D10): sin `DATABASE_URL` esta
// suite LANZA, no se omite en silencio.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { hydrateListingsForDedup } from '../../src/hydration.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { insertListingWithVersion, insertSourceWithKey } from './helpers.js';

// Puerta del Sol, Madrid: x = longitud (~-3.70), y = latitud (~40.42). Un
// swap x/y produciría longitude≈40 y latitude≈-3.7 — valores claramente
// distintos, no solo "fuera de rango", así que el test detecta el swap por
// comparación exacta, no por validación de rango.
const MADRID = { x: -3.7038, y: 40.4168 };

describe('hydrateListingsForDedup (D7)', () => {
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

  it('HYDRATE-1a: sourceId es la clave de dominio de la fuente, nunca el uuid de storage', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const { listingId } = await insertListingWithVersion(db, sourceId, {
      priceCents: 200_000_00,
      propertyType: 'flat',
    });

    const hydrated = await hydrateListingsForDedup(db, [listingId]);
    const listing = hydrated.get(listingId);

    expect(listing?.sourceId).toBe('idealista');
    expect(listing?.sourceId).not.toBe(sourceId);
  });

  it('D7: hidrata coordenadas x→longitud, y→latitud contra un punto real de Madrid', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const { listingId } = await insertListingWithVersion(db, sourceId, {
      priceCents: 250_000_00,
      location: MADRID,
      propertyType: 'flat',
    });

    const hydrated = await hydrateListingsForDedup(db, [listingId]);
    const listing = hydrated.get(listingId);

    expect(listing?.coordinates?.longitude).toBe(MADRID.x);
    expect(listing?.coordinates?.latitude).toBe(MADRID.y);
  });

  it('HYDRATE-2a: el resultado tiene la forma completa de un Listing, con todos los campos opcionales presentes', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const { listingId } = await insertListingWithVersion(db, sourceId, {
      priceCents: 180_000_00,
      operation: 'rent',
      propertyType: 'flat',
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      floor: '3',
      title: 'Piso luminoso',
      description: 'Piso reformado',
      address: 'Calle Mayor 1',
    });

    const hydrated = await hydrateListingsForDedup(db, [listingId]);
    const listing = hydrated.get(listingId);
    if (!listing) {
      throw new Error('la hidratación no devolvió el listing esperado');
    }

    expect(listing.url).toBe('https://example.test/anuncio');
    expect(listing.operation).toBe('rent');
    expect(listing.propertyType).toBe('flat');
    expect(listing.priceCents).toBe(180_000_00);
    expect(listing.surfaceM2).toBe(90);
    expect(listing.rooms).toBe(3);
    expect(listing.bathrooms).toBe(2);
    expect(listing.floor).toBe('3');
    expect(listing.title).toBe('Piso luminoso');
    expect(listing.description).toBe('Piso reformado');
    expect(listing.address).toBe('Calle Mayor 1');
    // …ForDedup (D7): features/location deliberadamente NO se cargan.
    expect(listing.features).toEqual([]);
    expect(listing.location).toBeUndefined();
  });

  it('HYDRATE-2b: un campo opcional ausente hidrata como AUSENTE, nunca como un valor por defecto', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    // propertyType SÍ se fija: es obligatorio en Listing, no uno de los
    // campos opcionales que este test comprueba (surfaceM2, rooms,
    // bathrooms, floor, title, description, address, coordinates).
    const { listingId } = await insertListingWithVersion(db, sourceId, {
      priceCents: 150_000_00,
      propertyType: 'flat',
    });

    const hydrated = await hydrateListingsForDedup(db, [listingId]);
    const listing = hydrated.get(listingId);
    if (!listing) {
      throw new Error('la hidratación no devolvió el listing esperado');
    }

    expect(listing.surfaceM2).toBeUndefined();
    expect(listing.rooms).toBeUndefined();
    expect(listing.bathrooms).toBeUndefined();
    expect(listing.floor).toBeUndefined();
    expect(listing.title).toBeUndefined();
    expect(listing.description).toBeUndefined();
    expect(listing.address).toBeUndefined();
    // No basta con "es undefined": la clave no debe existir como null
    // explícito — distingue un default sintético de una ausencia real.
    expect(Object.hasOwn(listing, 'surfaceM2')).toBe(false);
    expect(listing.coordinates).toBeUndefined();
  });

  it('devuelve un Map vacío cuando no se piden ids (sin consultar la base de datos)', async () => {
    const result = await hydrateListingsForDedup(db, []);
    expect(result.size).toBe(0);
  });

  it('hidrata varios listings a la vez, cada uno bajo su propia clave', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const { listingId: idA } = await insertListingWithVersion(db, sourceId, {
      priceCents: 100_000_00,
      propertyType: 'flat',
    });
    const { listingId: idB } = await insertListingWithVersion(db, sourceId, {
      priceCents: 200_000_00,
      propertyType: 'house',
    });

    const hydrated = await hydrateListingsForDedup(db, [idA, idB]);

    expect(hydrated.size).toBe(2);
    expect(hydrated.get(idA)?.priceCents).toBe(100_000_00);
    expect(hydrated.get(idB)?.priceCents).toBe(200_000_00);
  });

  it('lanza un error claro cuando propertyType es NULL (Listing.propertyType es obligatorio, HYDRATE-2)', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    // Sin `propertyType`: a diferencia de `operation`, esta columna no
    // tiene CHECK de vocabulario en `listing_versions`, así que el único
    // requisito violable en la práctica es la presencia.
    const { listingId } = await insertListingWithVersion(db, sourceId, { priceCents: 100_000_00 });

    await expect(hydrateListingsForDedup(db, [listingId])).rejects.toThrow(/propertyType/i);
  });
});

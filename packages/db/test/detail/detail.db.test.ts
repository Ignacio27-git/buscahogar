// ROADMAP 1.12 (diseño D3; docs/DECISIONS.md, decisión 061) — Q1/Q2 contra
// PostgreSQL real. EJECUTANDO — `.toSQL()` alone is not acceptable evidence
// (D11: la disciplina exacta que `search.ts` violó — 21 tests de `.toSQL()`
// en verde detrás de un 42702 ambiguo, `search.ts:28-38`). Fail-loud
// (vitest.detail.config.ts, script `test:detail`, sin `describeWithDb`): la
// suite de detalle es nueva y no puede demostrar nada con un verde vacío,
// mismo criterio que `vitest.consolidation.config.ts` (ROADMAP 1.10).
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ConsolidationInput } from '../../src/consolidation.js';
import { writeConsolidation } from '../../src/consolidation.js';
import type { Database } from '../../src/db.js';
import { getPropertyDetailHeader, getPropertySources } from '../../src/detail.js';
import { listingVersions, listings, properties, propertyListings, sources } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';

async function insertSourceKeyed(db: Database, key: string): Promise<string> {
  const [row] = await db.insert(sources).values({ key, name: key, kind: 'api' }).returning({ id: sources.id });
  if (!row) {
    throw new Error(`No se pudo insertar la fuente de prueba con key="${key}"`);
  }
  return row.id;
}

interface ListingOverrides {
  readonly url?: string;
  readonly status?: string;
  readonly thumbnailUrl?: string;
  readonly numPhotos?: number;
}

async function insertListingRow(db: Database, sourceId: string, overrides: ListingOverrides = {}): Promise<string> {
  const [row] = await db
    .insert(listings)
    .values({
      sourceId,
      externalId: `ext-${randomUUID()}`,
      url: overrides.url ?? 'https://example.test/anuncio',
      ...(overrides.status !== undefined ? { status: overrides.status } : {}),
      ...(overrides.thumbnailUrl !== undefined ? { thumbnailUrl: overrides.thumbnailUrl } : {}),
      ...(overrides.numPhotos !== undefined ? { numPhotos: overrides.numPhotos } : {}),
    })
    .returning({ id: listings.id });
  if (!row) {
    throw new Error('No se pudo insertar el anuncio de prueba');
  }
  return row.id;
}

interface VersionOverrides {
  readonly priceCents?: number;
  readonly propertyType?: string;
}

async function insertCurrentVersion(db: Database, listingId: string, overrides: VersionOverrides = {}): Promise<void> {
  await db.insert(listingVersions).values({
    listingId,
    version: 1,
    isCurrent: true,
    priceCents: overrides.priceCents ?? 200_000_00,
    operation: 'sale',
    ...(overrides.propertyType !== undefined ? { propertyType: overrides.propertyType } : {}),
  });
}

async function insertPropertyRow(
  db: Database,
  overrides: Partial<typeof properties.$inferInsert> = {}
): Promise<string> {
  const [row] = await db.insert(properties).values(overrides).returning({ id: properties.id });
  if (!row) {
    throw new Error('No se pudo insertar la vivienda consolidada de prueba');
  }
  return row.id;
}

async function linkPropertyListing(db: Database, propertyId: string, listingId: string): Promise<void> {
  await db.insert(propertyListings).values({
    propertyId,
    listingId,
    score: 1,
    strategyName: 'test',
    strategyVersion: '1',
    signals: {},
  });
}

function baseConsolidationInput(overrides: Partial<ConsolidationInput> = {}): ConsolidationInput {
  return {
    strategyName: 'test',
    strategyVersion: '1',
    radiusMeters: 300,
    priceBandCents: 2_500_000,
    surfaceToleranceM2: 10,
    listingsConsidered: 0,
    pairs: [],
    groups: [],
    refusedComponentsCount: 0,
    ...overrides,
  };
}

describe('detail.ts — Q1/Q2 contra Postgres real (diseño D3)', () => {
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

  it('la misma URL sobrevive a un reproceso de deduplicación (PD-1)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingId = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingId, { propertyType: 'flat' });

    const input = baseConsolidationInput({
      listingsConsidered: 1,
      groups: [{ listingIds: [listingId], winnerId: listingId }],
    });

    const first = await writeConsolidation(db, input);
    expect(first.propertiesCreated).toBe(1);
    const beforeHeader = await getPropertyDetailHeader(db, listingId);
    expect(beforeHeader).toBeDefined();

    const second = await writeConsolidation(db, input);
    const afterHeader = await getPropertyDetailHeader(db, listingId);

    expect(afterHeader).toBeDefined();
    // Q6 reconstruye `properties` con ids nuevos en cada reproceso — la URL
    // sigue resolviendo porque está keyed en `listings.id`, estable.
    expect(afterHeader?.id).not.toBe(beforeHeader?.id);
    expect(second.runId).not.toBe(first.runId);
  });

  it('dos listings miembro, una sola vivienda: ambas URLs resuelven a los mismos datos consolidados', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingA = await insertListingRow(db, sourceId);
    const listingB = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingA, { priceCents: 100_000_00 });
    await insertCurrentVersion(db, listingB, { priceCents: 120_000_00 });

    const propertyId = await insertPropertyRow(db, { minPriceCents: 100_000_00, listingCount: 2 });
    await linkPropertyListing(db, propertyId, listingA);
    await linkPropertyListing(db, propertyId, listingB);

    const headerFromA = await getPropertyDetailHeader(db, listingA);
    const headerFromB = await getPropertyDetailHeader(db, listingB);

    expect(headerFromA?.id).toBe(propertyId);
    expect(headerFromB?.id).toBe(propertyId);
    expect(headerFromA?.minPriceCents).toBe(100_000_00);
  });

  it('sources tiene una fila por miembro, cada una con su propio precio, identidad de fuente y url', async () => {
    const idealistaId = await insertSourceKeyed(db, 'idealista');
    const fotocasaId = await insertSourceKeyed(db, 'fotocasa');
    const listingA = await insertListingRow(db, idealistaId, { url: 'https://idealista.test/1' });
    const listingB = await insertListingRow(db, fotocasaId, { url: 'https://fotocasa.test/1' });
    await insertCurrentVersion(db, listingA, { priceCents: 100_000_00 });
    await insertCurrentVersion(db, listingB, { priceCents: 150_000_00 });

    const propertyId = await insertPropertyRow(db, { minPriceCents: 100_000_00, listingCount: 2 });
    await linkPropertyListing(db, propertyId, listingA);
    await linkPropertyListing(db, propertyId, listingB);

    const rows = await getPropertySources(db, propertyId);
    expect(rows).toHaveLength(2);

    const bySourceKey = new Map(rows.map((row) => [row.sourceKey, row]));
    expect(bySourceKey.get('idealista')?.priceCents).toBe(100_000_00);
    expect(bySourceKey.get('idealista')?.url).toBe('https://idealista.test/1');
    expect(bySourceKey.get('fotocasa')?.priceCents).toBe(150_000_00);
    expect(bySourceKey.get('fotocasa')?.url).toBe('https://fotocasa.test/1');
  });

  it('property.minPriceCents es el mínimo de las 3 versiones vigentes, consistente con cada precio de fuente (CLAUDE.md)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingA = await insertListingRow(db, sourceId);
    const listingB = await insertListingRow(db, sourceId);
    const listingC = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingA, { priceCents: 100_000_00 });
    await insertCurrentVersion(db, listingB, { priceCents: 150_000_00 });
    await insertCurrentVersion(db, listingC, { priceCents: 120_000_00 });

    const propertyId = await insertPropertyRow(db, { minPriceCents: 100_000_00, listingCount: 3 });
    await linkPropertyListing(db, propertyId, listingA);
    await linkPropertyListing(db, propertyId, listingB);
    await linkPropertyListing(db, propertyId, listingC);

    const header = await getPropertyDetailHeader(db, listingA);
    const sourceRows = await getPropertySources(db, propertyId);

    expect(header?.minPriceCents).toBe(100_000_00);
    expect(sourceRows.map((row) => row.priceCents).sort((a, b) => a - b)).toEqual([100_000_00, 120_000_00, 150_000_00]);
  });

  it('N=1 devuelve exactamente una fila en sources, nunca error ni array vacío (PD-A)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingId = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingId);

    const propertyId = await insertPropertyRow(db, { minPriceCents: 200_000_00, listingCount: 1 });
    await linkPropertyListing(db, propertyId, listingId);

    const header = await getPropertyDetailHeader(db, listingId);
    const sourceRows = await getPropertySources(db, propertyId);

    expect(header).toBeDefined();
    expect(sourceRows).toHaveLength(1);
  });

  it('una fuente retirada (status=removed) sigue siendo alcanzable: sin 404, marcada no disponible (A-5)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingId = await insertListingRow(db, sourceId, { status: 'removed' });
    await insertCurrentVersion(db, listingId);

    const propertyId = await insertPropertyRow(db, { minPriceCents: 200_000_00, listingCount: 1 });
    await linkPropertyListing(db, propertyId, listingId);

    const header = await getPropertyDetailHeader(db, listingId);
    const sourceRows = await getPropertySources(db, propertyId);

    expect(header).toBeDefined();
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0]?.status).toBe('removed');
  });

  it('404: uuid bien formado pero sin fila property_listings coincidente (listing inexistente por completo)', async () => {
    const header = await getPropertyDetailHeader(db, randomUUID());
    expect(header).toBeUndefined();
  });

  it('404 contenido (AR-2, caso cuarto): listing ingerido tras el último reproceso, con versión vigente pero sin fila property_listings', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingId = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingId);
    // Deliberadamente SIN linkPropertyListing: simula un listing barrido
    // después del último `reprocess-dedup`.

    const header = await getPropertyDetailHeader(db, listingId);
    expect(header).toBeUndefined();
  });

  it('score y signals están ausentes de las claves del objeto devuelto (PD-3)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingId = await insertListingRow(db, sourceId);
    await insertCurrentVersion(db, listingId);
    const propertyId = await insertPropertyRow(db, { minPriceCents: 200_000_00, listingCount: 1 });
    await linkPropertyListing(db, propertyId, listingId);

    const header = await getPropertyDetailHeader(db, listingId);
    const sourceRows = await getPropertySources(db, propertyId);

    expect(header).toBeDefined();
    expect(Object.keys(header ?? {})).not.toContain('score');
    expect(Object.keys(header ?? {})).not.toContain('signals');
    expect(sourceRows[0]).toBeDefined();
    expect(Object.keys(sourceRows[0] ?? {})).not.toContain('score');
    expect(Object.keys(sourceRows[0] ?? {})).not.toContain('signals');
  });

  it('el parámetro se liga como bind param, nunca por interpolación de cadena (matriz de amenazas: path traversal / segment injection)', async () => {
    const injectionAttempt = "'; DROP TABLE properties; --";

    await expect(getPropertyDetailHeader(db, injectionAttempt)).rejects.toThrow();

    // La tabla properties sigue intacta y consultable tras el intento: si el
    // parámetro se hubiera interpolado como texto, la sentencia habría
    // podido ejecutar SQL arbitrario en vez de fallar por un simple error de
    // tipo (uuid inválido).
    const stillQueryable = await db.select().from(properties).limit(1);
    expect(Array.isArray(stillQueryable)).toBe(true);
  });
});

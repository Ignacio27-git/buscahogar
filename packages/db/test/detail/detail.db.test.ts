// ROADMAP 1.12 (diseño D3; docs/DECISIONS.md, decisión 061) — Q1/Q2 contra
// PostgreSQL real. EJECUTANDO — `.toSQL()` alone is not acceptable evidence
// (D11: la disciplina exacta que `search.ts` violó — 21 tests de `.toSQL()`
// en verde detrás de un 42702 ambiguo, `search.ts:28-38`). Fail-loud
// (vitest.detail.config.ts, script `test:detail`, sin `describeWithDb`): la
// suite de detalle es nueva y no puede demostrar nada con un verde vacío,
// mismo criterio que `vitest.consolidation.config.ts` (ROADMAP 1.10).
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsolidationInput } from '../../src/consolidation.js';
import { writeConsolidation } from '../../src/consolidation.js';
import type { Database } from '../../src/db.js';
import { getPropertyDetailHeader, getPropertyPriceHistory, getPropertySources } from '../../src/detail.js';
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
  readonly id?: string;
  readonly url?: string;
  readonly status?: string;
  readonly thumbnailUrl?: string;
  readonly numPhotos?: number;
}

async function insertListingRow(db: Database, sourceId: string, overrides: ListingOverrides = {}): Promise<string> {
  const [row] = await db
    .insert(listings)
    .values({
      ...(overrides.id !== undefined ? { id: overrides.id } : {}),
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

  // ROADMAP 2.5 (S2, decisión 109; PS-4, S-PS-6): la visibilidad afecta solo a
  // la búsqueda. El detalle sigue listando TODOS los anuncios, incluidos los
  // inactivos, y una vivienda sin ningún anuncio activo no da 404.
  it('S-PS-6: una vivienda con todos los anuncios inactivos sigue resolviendo y lista todos sus anuncios (sin 404)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const listingA = await insertListingRow(db, sourceId, { status: 'inactive' });
    const listingB = await insertListingRow(db, sourceId, { status: 'inactive' });
    await insertCurrentVersion(db, listingA, { priceCents: 200_000_00 });
    await insertCurrentVersion(db, listingB, { priceCents: 180_000_00 });
    await db
      .update(listings)
      .set({ inactiveSince: new Date(), inactiveReason: 'delisted' })
      .where(inArray(listings.id, [listingA, listingB]));

    await writeConsolidation(
      db,
      baseConsolidationInput({
        listingsConsidered: 2,
        pairs: [
          {
            listingAId: listingA < listingB ? listingA : listingB,
            listingBId: listingA < listingB ? listingB : listingA,
            band: 'accept',
            score: 0.95,
            signals: { exactAddress: { value: 1, weight: 0.7 } },
          },
        ],
        groups: [{ listingIds: [listingA, listingB].sort(), winnerId: listingA }],
      })
    );

    const header = await getPropertyDetailHeader(db, listingA);
    expect(header).toBeDefined();
    expect(header?.listingCount).toBe(2);
    expect(header?.minPriceCents).toBe(180_000_00);

    const [property] = await db.select().from(properties);
    expect(property?.activeListingCount).toBe(0);
    const sourceRows = await getPropertySources(db, property?.id ?? '');
    expect(sourceRows).toHaveLength(2);
    expect(sourceRows.every((row) => row.status === 'inactive')).toBe(true);
  });

  // Paso D.9 (spec property-detail-query): un único orden determinista para la
  // lista y la galería de fuentes: activos primero, luego precio, luego id.
  it('D.9: un anuncio activo va antes que uno retirado aunque este sea más barato', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const removed = await insertListingRow(db, sourceId, { status: 'removed' });
    const active = await insertListingRow(db, sourceId, { status: 'active' });
    await insertCurrentVersion(db, removed, { priceCents: 200_000_00 });
    await insertCurrentVersion(db, active, { priceCents: 300_000_00 });
    const propertyId = await insertPropertyRow(db, { minPriceCents: 200_000_00, listingCount: 2 });
    await linkPropertyListing(db, propertyId, removed);
    await linkPropertyListing(db, propertyId, active);

    const rows = await getPropertySources(db, propertyId);
    expect(rows.map((row) => row.listingId)).toEqual([active, removed]);
  });

  it('D.9: con precio igual desempata por id ascendente, en cada llamada', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const lowId = '00000000-0000-4000-8000-000000000005';
    const highId = '00000000-0000-4000-8000-000000000007';
    // Se insertan y enlazan en orden inverso para que el orden físico no ayude.
    await insertListingRow(db, sourceId, { id: highId });
    await insertListingRow(db, sourceId, { id: lowId });
    await insertCurrentVersion(db, highId, { priceCents: 250_000_00 });
    await insertCurrentVersion(db, lowId, { priceCents: 250_000_00 });
    const propertyId = await insertPropertyRow(db, { minPriceCents: 250_000_00, listingCount: 2 });
    await linkPropertyListing(db, propertyId, highId);
    await linkPropertyListing(db, propertyId, lowId);

    for (let call = 0; call < 3; call += 1) {
      const rows = await getPropertySources(db, propertyId);
      expect(rows.map((row) => row.listingId)).toEqual([lowId, highId]);
    }
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

// D.10 — histórico de precios: todas las versiones, sin filtrar por
// `isCurrent` ni por `status`, en una única sentencia.
interface HistoryVersion {
  readonly version: number;
  readonly priceCents: number;
  readonly capturedAt: string;
  readonly isCurrent?: boolean;
  readonly redacted?: boolean;
}

async function insertHistoryVersions(
  db: Database,
  listingId: string,
  versions: readonly HistoryVersion[]
): Promise<void> {
  for (const v of versions) {
    await db.insert(listingVersions).values({
      listingId,
      version: v.version,
      isCurrent: v.isCurrent ?? false,
      priceCents: v.priceCents,
      operation: 'sale',
      description: v.redacted === true ? null : 'texto',
      raw: v.redacted === true ? null : { a: 1 },
      capturedAt: new Date(v.capturedAt),
    });
  }
}

describe('getPropertyPriceHistory — contra Postgres real (D.10)', () => {
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

  async function propertyWithListing(
    sourceKey: string,
    status?: string
  ): Promise<{ readonly propertyId: string; readonly listingId: string }> {
    const sourceId = await insertSourceKeyed(db, sourceKey);
    const listingId = await insertListingRow(db, sourceId, status !== undefined ? { status } : {});
    const propertyId = await insertPropertyRow(db, { listingCount: 1 });
    await linkPropertyListing(db, propertyId, listingId);
    return { propertyId, listingId };
  }

  it('devuelve todas las versiones de un anuncio, también las no vigentes', async () => {
    const { propertyId, listingId } = await propertyWithListing('idealista');
    await insertHistoryVersions(db, listingId, [
      { version: 1, priceCents: 300_000, capturedAt: '2026-01-01T10:00:00Z' },
      { version: 2, priceCents: 290_000, capturedAt: '2026-02-01T10:00:00Z' },
      { version: 3, priceCents: 280_000, capturedAt: '2026-03-01T10:00:00Z', isCurrent: true },
    ]);

    const rows = await getPropertyPriceHistory(db, propertyId);

    expect(rows.map((r) => r.priceCents)).toEqual([300_000, 290_000, 280_000]);
    expect(rows.every((r) => r.listingId === listingId && r.sourceKey === 'idealista')).toBe(true);
    expect(rows[0]?.capturedAt).toBeInstanceOf(Date);
  });

  it('una vivienda desconocida devuelve un array vacío', async () => {
    const rows = await getPropertyPriceHistory(db, randomUUID());
    expect(rows).toEqual([]);
  });

  it('un anuncio retirado conserva sus versiones con su estado', async () => {
    const { propertyId, listingId } = await propertyWithListing('kyero', 'removed');
    await insertHistoryVersions(db, listingId, [
      { version: 1, priceCents: 100_000, capturedAt: '2026-01-01T10:00:00Z' },
      { version: 2, priceCents: 95_000, capturedAt: '2026-02-01T10:00:00Z', isCurrent: true },
    ]);

    const rows = await getPropertyPriceHistory(db, propertyId);

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'removed')).toBe(true);
  });

  it('un anuncio con descripción y raw redactados (107) mantiene precio y fecha', async () => {
    const { propertyId, listingId } = await propertyWithListing('idealista', 'removed');
    await insertHistoryVersions(db, listingId, [
      { version: 1, priceCents: 100_000, capturedAt: '2026-01-01T10:00:00Z', redacted: true },
      { version: 2, priceCents: 100_000, capturedAt: '2026-02-01T10:00:00Z', isCurrent: true, redacted: true },
    ]);

    const rows = await getPropertyPriceHistory(db, propertyId);

    expect(rows.map((r) => [r.priceCents, r.capturedAt.toISOString()])).toEqual([
      [100_000, '2026-01-01T10:00:00.000Z'],
      [100_000, '2026-02-01T10:00:00.000Z'],
    ]);
  });

  it('desempata por capturedAt, luego versión y luego id de anuncio, igual en cada llamada', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const a = await insertListingRow(db, sourceId, { id: '00000000-0000-4000-8000-000000000002' });
    const b = await insertListingRow(db, sourceId, { id: '00000000-0000-4000-8000-000000000001' });
    const propertyId = await insertPropertyRow(db, { listingCount: 2 });
    await linkPropertyListing(db, propertyId, a);
    await linkPropertyListing(db, propertyId, b);
    const same = '2026-01-01T10:00:00Z';
    await insertHistoryVersions(db, a, [
      { version: 1, priceCents: 1, capturedAt: same },
      { version: 2, priceCents: 2, capturedAt: same, isCurrent: true },
    ]);
    await insertHistoryVersions(db, b, [
      { version: 1, priceCents: 3, capturedAt: same },
      { version: 2, priceCents: 4, capturedAt: same, isCurrent: true },
    ]);

    const first = await getPropertyPriceHistory(db, propertyId);
    const second = await getPropertyPriceHistory(db, propertyId);

    // Versión ascendente primero; dentro de la misma versión, id de anuncio ascendente (b < a).
    expect(first.map((r) => r.priceCents)).toEqual([3, 1, 4, 2]);
    expect(second).toEqual(first);
  });

  it('proyecta exactamente cinco campos', async () => {
    const { propertyId, listingId } = await propertyWithListing('idealista');
    await insertHistoryVersions(db, listingId, [
      { version: 1, priceCents: 1, capturedAt: '2026-01-01T10:00:00Z', isCurrent: true },
    ]);

    const [row] = await getPropertyPriceHistory(db, propertyId);

    expect(Object.keys(row ?? {}).sort()).toEqual(['capturedAt', 'listingId', 'priceCents', 'sourceKey', 'status']);
  });

  it('emite una única sentencia SQL para varios anuncios y versiones (sin N+1)', async () => {
    const sourceId = await insertSourceKeyed(db, 'idealista');
    const propertyId = await insertPropertyRow(db, { listingCount: 3 });
    for (let i = 0; i < 3; i += 1) {
      const listingId = await insertListingRow(db, sourceId);
      await linkPropertyListing(db, propertyId, listingId);
      await insertHistoryVersions(db, listingId, [
        { version: 1, priceCents: 100 + i, capturedAt: '2026-01-01T10:00:00Z' },
        { version: 2, priceCents: 200 + i, capturedAt: '2026-02-01T10:00:00Z' },
        { version: 3, priceCents: 300 + i, capturedAt: '2026-03-01T10:00:00Z', isCurrent: true },
      ]);
    }

    const spy = vi.spyOn(pool, 'query');
    try {
      const rows = await getPropertyPriceHistory(db, propertyId);
      expect(rows).toHaveLength(9);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

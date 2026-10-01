// Paso 1.7 — listing-writer.ts (diseño D5; PERSIST-1..8). Contra PostgreSQL
// real; sin describeWithDb (D2, resuelve D-a) — DATABASE_URL ya está
// garantizada por el setupFile de esta config.
import { randomUUID } from 'node:crypto';

import type { Listing } from '@buscahogar/core';
import {
  listingPresenceChecks,
  listings,
  listingVersions,
  properties,
  propertyListings,
  tombstoneExpiredListings,
} from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IdealistaElement } from '../../src/sources/idealista/raw-element.schema.js';
import { rawElementSchema } from '../../src/sources/idealista/raw-element.schema.js';
import { createListingWriter } from '../../src/sweep/listing-writer.js';
import type { PersistPageItem } from '../../src/sweep/store.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

// Estrecha `T | undefined` a `T` con un mensaje nombrado en vez de `!` (el
// linter prohíbe la aserción no-nula, D2/eslint.config.mjs compartido):
// misma propiedad en tiempo de ejecución que `!` (revienta si la fila no
// existe), pero con un mensaje explícito en vez de un `TypeError` genérico
// sobre `undefined`.
function requireRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}

let externalIdCounter = 0;

function buildItem(overrides: Partial<Listing> = {}): PersistPageItem {
  externalIdCounter += 1;
  const externalId = overrides.externalId ?? `ext-${String(externalIdCounter)}`;
  const listing: Listing = {
    sourceId: 'idealista',
    externalId,
    url: 'https://www.idealista.com/inmueble/123',
    operation: 'sale',
    propertyType: 'flat',
    priceCents: 200_000_00,
    surfaceM2: 80,
    rooms: 3,
    bathrooms: 1,
    floor: '2',
    title: 'Piso en el centro',
    description: 'Piso luminoso',
    address: 'Calle Recogidas 1',
    features: [],
    ...overrides,
  };
  const raw: IdealistaElement = rawElementSchema.parse({
    propertyCode: externalId,
    price: 200000,
    propertyType: 'flat',
    operation: 'sale',
    url: listing.url,
  });
  return { listing, raw };
}

describe('listing-writer — PERSIST-1..8, D5', () => {
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

  async function persistOne(
    sourceUuid: string,
    item: PersistPageItem
  ): Promise<ReturnType<ReturnType<typeof createListingWriter>['persistPage']>> {
    const writer = createListingWriter(db);
    return writer.persistPage({
      jobId: randomUUID(),
      sourceUuid,
      items: [item],
      nextCursor: undefined,
      fingerprint: 'fp-listing-writer-test',
    });
  }

  it('PERSIST-2a: un anuncio nuevo crea exactamente una fila listings y una listing_versions (version=1, is_current)', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem();

    const outcome = await persistOne(sourceUuid, item);

    expect(outcome).toEqual({ inserted: 1, versioned: 0, unchanged: 0 });

    const listingRows = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    expect(listingRows).toHaveLength(1);

    const versionRows = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, requireRow(listingRows[0], 'listings row no encontrada tras el insert').id));
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]?.version).toBe(1);
    expect(versionRows[0]?.isCurrent).toBe(true);
  });

  it('PERSIST-1a: una segunda visión del mismo external_id resuelve a la misma fila de identidad', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem();

    await persistOne(sourceUuid, item);
    await persistOne(sourceUuid, item);

    const listingRows = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    expect(listingRows).toHaveLength(1);
  });

  it('PERSIST-3a: una re-visión sin cambios solo actualiza last_seen_at/updated_at', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem();
    await persistOne(sourceUuid, item);

    const [before] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await persistOne(sourceUuid, item);
    const [after] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));

    expect(after?.id).toBe(before?.id);
    expect(after?.url).toBe(before?.url);
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.status).toBe(before?.status);
    expect(after?.lastSeenAt.getTime()).toBeGreaterThan(
      requireRow(before, 'listings row before-state no encontrada').lastSeenAt.getTime()
    );
  });

  it('PERSIST-5a: el mismo fixture barrido dos veces —incluida una superficie fraccional— no produce filas nuevas', async () => {
    const sourceUuid = await insertSource(db);
    // Trampa de redondeo (1.8/1.9 y D4): 78.5 se guarda como 79 en la
    // columna integer; barrer el mismo fixture dos veces NO debe generar
    // una versión nueva por culpa del redondeo.
    const item = buildItem({ surfaceM2: 78.5 });

    const first = await persistOne(sourceUuid, item);
    const second = await persistOne(sourceUuid, item);

    expect(first).toEqual({ inserted: 1, versioned: 0, unchanged: 0 });
    expect(second).toEqual({ inserted: 0, versioned: 0, unchanged: 1 });

    const listingRows = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    expect(listingRows).toHaveLength(1);
    const versionRows = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, requireRow(listingRows[0], 'listings row no encontrada tras el insert').id));
    expect(versionRows).toHaveLength(1);
  });

  it('PERSIST-6a: un cambio de precio inserta exactamente una versión nueva y demueve la cabeza anterior', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem({ priceCents: 200_000_00 });
    await persistOne(sourceUuid, item);

    const changed = buildItem({ externalId: item.listing.externalId, priceCents: 195_000_00 });
    const outcome = await persistOne(sourceUuid, changed);

    expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });

    const [listingRow] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    const versionRows = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, requireRow(listingRow, 'listings row no encontrada').id));
    expect(versionRows).toHaveLength(2);
    const current = versionRows.find((row) => row.isCurrent);
    expect(current?.version).toBe(2);
    expect(current?.priceCents).toBe(195_000_00);
    expect(versionRows.filter((row) => row.isCurrent)).toHaveLength(1);
  });

  it('PERSIST-6b: un cambio de contenido sin tocar el precio también inserta exactamente una versión nueva', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem({ description: 'Piso reformado' });
    await persistOne(sourceUuid, item);

    const changed = buildItem({
      externalId: item.listing.externalId,
      description: 'Piso reformado, aire acondicionado',
    });
    const outcome = await persistOne(sourceUuid, changed);

    expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });
  });

  it('PERSIST-6c: N cambios secuenciales dejan exactamente una cabeza con version = N+1', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem({ priceCents: 200_000_00 });
    await persistOne(sourceUuid, item);
    await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, priceCents: 195_000_00 }));
    await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, priceCents: 190_000_00 }));

    const [listingRow] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    const versionRows = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, requireRow(listingRow, 'listings row no encontrada').id));
    const currentRows = versionRows.filter((row) => row.isCurrent);
    expect(currentRows).toHaveLength(1);
    expect(currentRows[0]?.version).toBe(3);
  });

  it('PERSIST-7a: un anuncio ausente del barrido actual queda intacto (P6: sin escritor de status en este cambio)', async () => {
    const sourceUuid = await insertSource(db);
    const present = buildItem();
    const absent = buildItem();
    await persistOne(sourceUuid, present);
    await persistOne(sourceUuid, absent);

    const [beforeAbsent] = await db.select().from(listings).where(eq(listings.externalId, absent.listing.externalId));

    // Un barrido posterior que solo trae `present` — `absent` no aparece.
    await persistOne(sourceUuid, buildItem({ externalId: present.listing.externalId, priceCents: 150_000_00 }));

    const [afterAbsent] = await db.select().from(listings).where(eq(listings.externalId, absent.listing.externalId));
    expect(afterAbsent).toEqual(beforeAbsent);
  });

  it('PERSIST-8a: reanudar y reprocesar elementos ya confirmados se trata como sin cambios, cero duplicados', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem();
    await persistOne(sourceUuid, item);

    // Simula una reanudación que vuelve a traer el mismo elemento ya
    // persistido en una página anterior.
    const outcome = await persistOne(sourceUuid, item);
    expect(outcome).toEqual({ inserted: 0, versioned: 0, unchanged: 1 });

    const listingRows = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    expect(listingRows).toHaveLength(1);
  });

  it('PERSIST-8b: una inserción duplicada forzada en (source_id, external_id) es rechazada por el índice único', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem();
    await persistOne(sourceUuid, item);

    let caught: unknown;
    try {
      await db.insert(listings).values({ sourceId: sourceUuid, externalId: item.listing.externalId, url: item.listing.url });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe('23505');
  });

  it('el orden demote-antes-de-insertar nunca dispara listing_versions_current_idx', async () => {
    const sourceUuid = await insertSource(db);
    const item = buildItem({ priceCents: 200_000_00 });
    await persistOne(sourceUuid, item);
    await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, priceCents: 195_000_00 }));

    const [listingRow] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
    const currentRows = await db
      .select()
      .from(listingVersions)
      .where(
        and(
          eq(listingVersions.listingId, requireRow(listingRow, 'listings row no encontrada').id),
          eq(listingVersions.isCurrent, true)
        )
      );
    expect(currentRows).toHaveLength(1);
  });

  // Hueco detectado por `sdd-verify` (obs #182, hallazgo CRÍTICO 2): el
  // escenario «Re-sighting with a different thumbnail» de la especificación no
  // tenía NINGÚN test ejecutado — solo la lectura del diff. Es el escenario que
  // protege la invariante no negociable del proyecto: `listings` no se
  // sobrescribe y de ahí sale el histórico. Si `thumbnailUrl` entrara en
  // `VERSION_COLUMN_FIELDS` (la decisión 059 lo prohíbe), cada recorte de
  // imagen del portal fabricaría una fila nueva en `listing_versions`.
  it('PERSIST-3b: una re-visión que solo cambia el thumbnail no crea versión nueva y congela el valor original', async () => {
    const sourceUuid = await insertSource(db);
    const externalId = `ext-thumb-${randomUUID()}`;
    const firstThumbnail = 'https://img4.idealista.com/blur/primera.webp';
    const secondThumbnail = 'https://img4.idealista.com/blur/segunda.webp';

    await persistOne(sourceUuid, buildItem({ externalId, thumbnailUrl: firstThumbnail }));
    await persistOne(sourceUuid, buildItem({ externalId, thumbnailUrl: secondThumbnail }));

    const [row] = await db.select().from(listings).where(eq(listings.externalId, externalId));
    const listingRow = requireRow(row, 'listings row no encontrada tras la re-visión');

    // Columna de IDENTIDAD: PERSIST-3 no la sobrescribe, así que se congela en
    // la primera vista. Coste aceptado y declarado en la decisión 059.
    expect(listingRow.thumbnailUrl).toBe(firstThumbnail);

    // Lo que de verdad protege este test: ni una versión nueva.
    const versions = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, listingRow.id));
    expect(versions).toHaveLength(1);
  });

  // ROADMAP 1.12 (spec: "numPhotos-only change does not version") — hermano de
  // PERSIST-3b: numPhotos es identity-column (decisión 062), así que una
  // re-visión que solo cambia el recuento de fotos no debe abrir versión
  // nueva y el valor persistido se congela en la primera vista.
  it('PERSIST-3c: una re-visión que solo cambia numPhotos no crea versión nueva y congela el valor original', async () => {
    const sourceUuid = await insertSource(db);
    const externalId = `ext-numphotos-${randomUUID()}`;

    await persistOne(sourceUuid, buildItem({ externalId, numPhotos: 30 }));
    await persistOne(sourceUuid, buildItem({ externalId, numPhotos: 32 }));

    const [row] = await db.select().from(listings).where(eq(listings.externalId, externalId));
    const listingRow = requireRow(row, 'listings row no encontrada tras la re-visión');

    // Columna de IDENTIDAD: se congela en la primera vista.
    expect(listingRow.numPhotos).toBe(30);

    // Lo que de verdad protege este test: ni una versión nueva.
    const versions = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, listingRow.id));
    expect(versions).toHaveLength(1);
  });

  // ROADMAP 2.5 (S2, decisión 106; S-LR-17 parte de estado, S-PS-4) —
  // reactivación básica: un anuncio inactivo visto de nuevo en un barrido vuelve
  // a estar activo, limpia sus columnas de ciclo de vida y refresca la
  // visibilidad de su vivienda. No toca la cola de verificación (fase S3).
  describe('reactivación de un anuncio inactivo visto de nuevo (S-LR-17, S-PS-4)', () => {
    async function markInactive(externalId: string, reason: 'delisted' | 'zone_purged' = 'delisted'): Promise<string> {
      const [row] = await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(Date.now() - 86_400_000), inactiveReason: reason })
        .where(eq(listings.externalId, externalId))
        .returning({ id: listings.id });
      return requireRow(row, 'listings row no encontrada al marcarla inactiva').id;
    }

    it.each(['delisted', 'zone_purged'] as const)(
      'un anuncio inactivo (%s) visto de nuevo vuelve a activo y limpia inactive_since/inactive_reason',
      async (reason) => {
        const sourceUuid = await insertSource(db);
        const item = buildItem();
        await persistOne(sourceUuid, item);
        await markInactive(item.listing.externalId, reason);

        await persistOne(sourceUuid, item);

        const [row] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
        expect(row?.status).toBe('active');
        expect(row?.inactiveSince).toBeNull();
        expect(row?.inactiveReason).toBeNull();
      }
    );

    it('la reactivación sin cambios de contenido NO crea versión (regla de versionado de listings)', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem();
      await persistOne(sourceUuid, item);
      const listingId = await markInactive(item.listing.externalId);

      const outcome = await persistOne(sourceUuid, item);

      expect(outcome).toEqual({ inserted: 0, versioned: 0, unchanged: 1 });
      const versions = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));
      expect(versions).toHaveLength(1);
    });

    it('la reactivación con un precio nuevo crea una versión nueva y deja una sola cabeza', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem();
      await persistOne(sourceUuid, item);
      const listingId = await markInactive(item.listing.externalId);

      const outcome = await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, priceCents: 150_000_00 }));

      expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });
      const versions = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));
      expect(versions).toHaveLength(2);
      expect(versions.filter((version) => version.isCurrent)).toHaveLength(1);
      const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
      expect(row?.status).toBe('active');
    });

    it('refresca la visibilidad de la vivienda: activos y precio mínimo, sin tocar property_listings', async () => {
      const sourceUuid = await insertSource(db);
      const itemA = buildItem({ priceCents: 900_00 });
      const itemB = buildItem({ priceCents: 700_00 });
      await persistOne(sourceUuid, itemA);
      await persistOne(sourceUuid, itemB);
      const [rowA] = await db.select().from(listings).where(eq(listings.externalId, itemA.listing.externalId));
      const listingA = requireRow(rowA, 'listing A no encontrado').id;
      const listingB = await markInactive(itemB.listing.externalId);
      const [property] = await db
        .insert(properties)
        .values({ listingCount: 2, activeListingCount: 1, minPriceCents: 900_00 })
        .returning({ id: properties.id });
      const propertyId = requireRow(property, 'vivienda no insertada').id;
      for (const listingId of [listingA, listingB]) {
        await db.insert(propertyListings).values({
          propertyId,
          listingId,
          score: 1,
          strategyName: 'test',
          strategyVersion: '1',
          signals: {},
        });
      }
      const linksBefore = await db.select().from(propertyListings);

      await persistOne(sourceUuid, itemB);

      const [after] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(after?.activeListingCount).toBe(2);
      expect(after?.minPriceCents).toBe(700_00);
      expect(await db.select().from(propertyListings)).toEqual(linksBefore);
    });

    it('un anuncio que ya estaba activo no toca ninguna vivienda (la caché solo se refresca al reactivar)', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem({ priceCents: 900_00 });
      await persistOne(sourceUuid, item);
      const [row] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
      const [property] = await db
        .insert(properties)
        .values({ listingCount: 1, activeListingCount: 5, minPriceCents: 1 })
        .returning({ id: properties.id });
      const propertyId = requireRow(property, 'vivienda no insertada').id;
      await db.insert(propertyListings).values({
        propertyId,
        listingId: requireRow(row, 'listing no encontrado').id,
        score: 1,
        strategyName: 'test',
        strategyVersion: '1',
        signals: {},
      });

      await persistOne(sourceUuid, item);

      const [after] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(after?.activeListingCount).toBe(5);
      expect(after?.minPriceCents).toBe(1);
    });
  });
  // ROADMAP 2.5 (refresh-retention-policy, S4; decisión 107, S-RP-20) — un anuncio
  // con tombstone (contenido redactado, `status = 'removed'`) visto de nuevo en un
  // barrido se reactiva y se REPUEBLA: miniatura y contenido vuelven, y como la
  // última versión está redactada se inserta una versión nueva aunque el precio no
  // haya cambiado. La congelación de la miniatura (decisión 059) sigue valiendo
  // para todo anuncio que NO tenga tombstone.
  describe('reaparición de un anuncio con tombstone (S-RP-20)', () => {
    const OLD_THUMBNAIL = 'https://img.example.test/vieja.jpg';
    const NEW_THUMBNAIL = 'https://img.example.test/nueva.jpg';

    async function persistAndTombstone(sourceUuid: string, item: PersistPageItem): Promise<string> {
      await persistOne(sourceUuid, item);
      const [row] = await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(Date.now() - 200 * 86_400_000), inactiveReason: 'delisted' })
        .where(eq(listings.externalId, item.listing.externalId))
        .returning({ id: listings.id });
      const listingId = requireRow(row, 'listings row no encontrada').id;
      expect(await tombstoneExpiredListings(db, { retentionDays: 180, batchSize: 500 })).toBe(1);
      return listingId;
    }

    it('vuelve a activo, limpia inactive_since/inactive_reason/tombstoned_at y rellena la miniatura', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem({ thumbnailUrl: OLD_THUMBNAIL });
      const listingId = await persistAndTombstone(sourceUuid, item);
      expect((await db.select().from(listings).where(eq(listings.id, listingId)))[0]?.thumbnailUrl).toBeNull();

      await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, thumbnailUrl: NEW_THUMBNAIL }));

      const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
      expect(row?.status).toBe('active');
      expect(row?.inactiveSince).toBeNull();
      expect(row?.inactiveReason).toBeNull();
      expect(row?.tombstonedAt).toBeNull();
      expect(row?.thumbnailUrl).toBe(NEW_THUMBNAIL);
    });

    it('inserta una versión nueva con descripción y raw aunque el contenido y el precio no hayan cambiado', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem();
      const listingId = await persistAndTombstone(sourceUuid, item);

      const outcome = await persistOne(sourceUuid, item);

      expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });
      const versions = await db
        .select()
        .from(listingVersions)
        .where(eq(listingVersions.listingId, listingId))
        .orderBy(listingVersions.version);
      expect(versions.map((version) => version.version)).toEqual([1, 2]);
      expect(versions.map((version) => version.isCurrent)).toEqual([false, true]);
      expect(versions[0]?.raw).toBeNull();
      expect(versions[0]?.description).toBeNull();
      expect(versions[1]?.raw).not.toBeNull();
      expect(versions[1]?.description).toBe('Piso luminoso');
      expect(versions.map((version) => version.priceCents)).toEqual([200_000_00, 200_000_00]);
    });

    it('sin descripción en el anuncio, la versión redactada (raw NULL) fuerza igualmente una versión nueva que restaura el raw', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem({ description: undefined });
      const listingId = await persistAndTombstone(sourceUuid, item);

      const outcome = await persistOne(sourceUuid, item);

      expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });
      const versions = await db
        .select()
        .from(listingVersions)
        .where(eq(listingVersions.listingId, listingId))
        .orderBy(listingVersions.version);
      expect(versions.map((version) => version.raw === null)).toEqual([true, false]);
      expect(versions.map((version) => version.isCurrent)).toEqual([false, true]);
    });

    it('con un precio nuevo inserta UNA sola versión nueva (la historia de precios continúa)', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem();
      const listingId = await persistAndTombstone(sourceUuid, item);

      const outcome = await persistOne(
        sourceUuid,
        buildItem({ externalId: item.listing.externalId, priceCents: 180_000_00 })
      );

      expect(outcome).toEqual({ inserted: 0, versioned: 1, unchanged: 0 });
      const versions = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));
      expect(versions).toHaveLength(2);
      expect(versions.filter((version) => version.isCurrent).map((version) => version.priceCents)).toEqual([180_000_00]);
    });

    it('un anuncio inactivo SIN tombstone visto de nuevo conserva su miniatura original (decisión 059)', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem({ thumbnailUrl: OLD_THUMBNAIL });
      await persistOne(sourceUuid, item);
      await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(), inactiveReason: 'delisted' })
        .where(eq(listings.externalId, item.listing.externalId));

      await persistOne(sourceUuid, buildItem({ externalId: item.listing.externalId, thumbnailUrl: NEW_THUMBNAIL }));

      const [row] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
      expect(row?.status).toBe('active');
      expect(row?.thumbnailUrl).toBe(OLD_THUMBNAIL);
    });

    it('borra su fila de la cola de presencia y refresca la visibilidad de su vivienda', async () => {
      const sourceUuid = await insertSource(db);
      const item = buildItem({ priceCents: 700_00 });
      const listingId = await persistAndTombstone(sourceUuid, item);
      const [property] = await db
        .insert(properties)
        .values({ listingCount: 1, activeListingCount: 0, minPriceCents: 700_00 })
        .returning({ id: properties.id });
      const propertyId = requireRow(property, 'vivienda no insertada').id;
      await db
        .insert(propertyListings)
        .values({ propertyId, listingId, score: 1, strategyName: 'test', strategyVersion: '1', signals: {} });

      await persistOne(sourceUuid, item);

      const [after] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(after?.activeListingCount).toBe(1);
    });
  });

  // ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — un anuncio visto de
  // nuevo en un barrido deja de ser sospechoso: su fila de la cola de presencia
  // se borra en la MISMA transacción de la página (S-LR-17).
  describe('cola de verificación de presencia: un anuncio visto de nuevo sale de la cola (S-LR-17)', () => {
    async function queue(externalId: string, zoneId: string): Promise<string> {
      const [row] = await db.select({ id: listings.id }).from(listings).where(eq(listings.externalId, externalId));
      const listingId = requireRow(row, 'listing no encontrado para encolar').id;
      await db.insert(listingPresenceChecks).values({ listingId, zoneId, checkAttempts: 1 });
      return listingId;
    }

    async function queuedListingIds(): Promise<readonly string[]> {
      const rows = await db.select({ listingId: listingPresenceChecks.listingId }).from(listingPresenceChecks);
      return rows.map((row) => row.listingId);
    }

    it('un anuncio activo en la cola que reaparece en una página se borra de la cola y sigue activo', async () => {
      const sourceUuid = await insertSource(db);
      const { zoneId } = await insertLocationWithZone(db);
      const item = buildItem();
      await persistOne(sourceUuid, item);
      await queue(item.listing.externalId, zoneId);

      await persistOne(sourceUuid, item);

      expect(await queuedListingIds()).toEqual([]);
      const [row] = await db.select().from(listings).where(eq(listings.externalId, item.listing.externalId));
      expect(row?.status).toBe('active');
    });

    it('un anuncio inactivo en la cola que reaparece se reactiva Y sale de la cola', async () => {
      const sourceUuid = await insertSource(db);
      const { zoneId } = await insertLocationWithZone(db);
      const item = buildItem();
      await persistOne(sourceUuid, item);
      const listingId = await queue(item.listing.externalId, zoneId);
      await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(), inactiveReason: 'delisted' })
        .where(eq(listings.id, listingId));

      await persistOne(sourceUuid, item);

      expect(await queuedListingIds()).toEqual([]);
      const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
      expect(row?.status).toBe('active');
      expect(row?.inactiveReason).toBeNull();
    });

    it('solo salen de la cola los anuncios de la página: los demás conservan su fila y sus intentos', async () => {
      const sourceUuid = await insertSource(db);
      const { zoneId } = await insertLocationWithZone(db);
      const seenAgain = buildItem();
      const untouched = buildItem();
      await persistOne(sourceUuid, seenAgain);
      await persistOne(sourceUuid, untouched);
      await queue(seenAgain.listing.externalId, zoneId);
      const untouchedId = await queue(untouched.listing.externalId, zoneId);

      await persistOne(sourceUuid, seenAgain);

      expect(await queuedListingIds()).toEqual([untouchedId]);
      const [row] = await db
        .select({ attempts: listingPresenceChecks.checkAttempts })
        .from(listingPresenceChecks)
        .where(eq(listingPresenceChecks.listingId, untouchedId));
      expect(row?.attempts).toBe(1);
    });

    it('un anuncio idéntico de OTRA fuente con el mismo external_id no toca la cola de esta fuente', async () => {
      const sourceA = await insertSource(db);
      const sourceB = await insertSource(db, { key: 'otra-fuente' });
      const { zoneId } = await insertLocationWithZone(db);
      const item = buildItem();
      await persistOne(sourceA, item);
      const queuedInA = await queue(item.listing.externalId, zoneId);

      await persistOne(sourceB, item);

      expect(await queuedListingIds()).toEqual([queuedInA]);
    });
  });
});

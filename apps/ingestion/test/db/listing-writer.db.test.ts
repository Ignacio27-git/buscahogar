// Paso 1.7 — listing-writer.ts (diseño D5; PERSIST-1..8). Contra PostgreSQL
// real; sin describeWithDb (D2, resuelve D-a) — DATABASE_URL ya está
// garantizada por el setupFile de esta config.
import { randomUUID } from 'node:crypto';

import type { Listing } from '@buscahogar/core';
import { listings, listingVersions } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IdealistaElement } from '../../src/sources/idealista/raw-element.schema.js';
import { rawElementSchema } from '../../src/sources/idealista/raw-element.schema.js';
import { createListingWriter } from '../../src/sweep/listing-writer.js';
import type { PersistPageItem } from '../../src/sweep/store.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertSource } from './helpers/seed-fixtures.js';

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
});

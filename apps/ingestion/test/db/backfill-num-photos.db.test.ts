// ROADMAP 1.12 — backfillNumPhotos contra PostgreSQL real (diseño D5, mismo
// patrón que backfill-thumbnails.db.test.ts, ROADMAP 1.11). Fail-loud
// (vitest.db.config.ts, sin describeWithDb): DATABASE_URL ya está garantizada
// por setup-db-env.ts antes de que arranque cualquier `it`.
//
// Llama SIEMPRE a la función EXPORTADA `backfillNumPhotos(db)`, nunca a
// `main()` (mismo contrato que test/db/backfill-thumbnails.db.test.ts):
// `main()` es el único lector de `process.env` de este script.
import { randomUUID } from 'node:crypto';

import { listingVersions, listings } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { backfillNumPhotos } from '../../scripts/backfill-num-photos.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertSource } from './helpers/seed-fixtures.js';

async function insertListingWithVersions(
  db: Database,
  sourceId: string,
  rawByVersion: readonly (Record<string, unknown> | null)[]
): Promise<string> {
  const [listing] = await db
    .insert(listings)
    .values({ sourceId, externalId: `ext-${randomUUID()}`, url: 'https://example.test/anuncio' })
    .returning({ id: listings.id });
  if (!listing) {
    throw new Error('No se pudo insertar el anuncio de prueba');
  }
  for (const [index, raw] of rawByVersion.entries()) {
    await db.insert(listingVersions).values({
      listingId: listing.id,
      version: index + 1,
      isCurrent: index === rawByVersion.length - 1,
      priceCents: 200_000_00,
      operation: 'sale',
      propertyType: 'flat',
      ...(raw !== null ? { raw } : {}),
    });
  }
  return listing.id;
}

describe('backfillNumPhotos — D5: zero-quota y datos ya persistidos', () => {
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

  it('rellena num_photos desde la versión MÁS ANTIGUA, deja NULL sin recuento, y cuenta ambos casos', async () => {
    const sourceId = await insertSource(db);

    // Dos versiones: la más antigua trae 30, la vigente trae 32 — debe
    // prevalecer 30 (identity-column, congelado en la primera vista).
    const listingWithNumPhotos = await insertListingWithVersions(db, sourceId, [
      { numPhotos: 30 },
      { numPhotos: 32 },
    ]);

    // Sin ningún numPhotos en ningún raw.
    const listingWithoutNumPhotos = await insertListingWithVersions(db, sourceId, [{ propertyCode: '999' }]);

    const outcome = await backfillNumPhotos(db);

    expect(outcome).toEqual({ updated: 1, skippedNoNumPhotos: 1 });

    const [rowWith] = await db.select().from(listings).where(eq(listings.id, listingWithNumPhotos));
    expect(rowWith?.numPhotos).toBe(30);

    const [rowWithout] = await db.select().from(listings).where(eq(listings.id, listingWithoutNumPhotos));
    expect(rowWithout?.numPhotos).toBeNull();
  });

  it('es idempotente: una segunda ejecución no cambia valores ya rellenados ni crea versiones nuevas', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListingWithVersions(db, sourceId, [{ numPhotos: 46 }]);

    const first = await backfillNumPhotos(db);
    expect(first).toEqual({ updated: 1, skippedNoNumPhotos: 0 });

    const versionsBefore = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));

    const second = await backfillNumPhotos(db);
    expect(second).toEqual({ updated: 0, skippedNoNumPhotos: 0 });

    const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
    expect(row?.numPhotos).toBe(46);

    const versionsAfter = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));
    expect(versionsAfter).toHaveLength(versionsBefore.length);
  });
});

// ROADMAP 1.11 — backfillThumbnails contra PostgreSQL real (diseño D6, D12).
// Fail-loud (vitest.db.config.ts, sin describeWithDb): DATABASE_URL ya está
// garantizada por setup-db-env.ts antes de que arranque cualquier `it`.
//
// Llama SIEMPRE a la función EXPORTADA `backfillThumbnails(db)`, nunca a
// `main()` (mismo contrato que test/db/reprocess-dedup.db.test.ts): `main()`
// es el único lector de `process.env` de este script.
import { randomUUID } from 'node:crypto';

import { listingVersions, listings } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { backfillThumbnails } from '../../scripts/backfill-thumbnails.js';
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

describe('backfillThumbnails — D6, D12: zero-quota y datos ya persistidos', () => {
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

  it('rellena thumbnail_url desde la versión MÁS ANTIGUA, deja NULL sin miniatura, y cuenta ambos casos', async () => {
    const sourceId = await insertSource(db);

    // Dos versiones: la más antigua trae miniatura A, la vigente trae B —
    // debe prevalecer A (D6, congelado en la primera vista).
    const listingWithThumbnail = await insertListingWithVersions(db, sourceId, [
      { thumbnail: 'https://img4.idealista.com/foto-antigua.webp' },
      { thumbnail: 'https://img4.idealista.com/foto-nueva.webp' },
    ]);

    // Sin ninguna miniatura en ningún raw.
    const listingWithoutThumbnail = await insertListingWithVersions(db, sourceId, [
      { propertyCode: '999' },
    ]);

    const outcome = await backfillThumbnails(db);

    expect(outcome).toEqual({ updated: 1, skippedNoThumbnail: 1 });

    const [rowWith] = await db.select().from(listings).where(eq(listings.id, listingWithThumbnail));
    expect(rowWith?.thumbnailUrl).toBe('https://img4.idealista.com/foto-antigua.webp');

    const [rowWithout] = await db.select().from(listings).where(eq(listings.id, listingWithoutThumbnail));
    expect(rowWithout?.thumbnailUrl).toBeNull();
  });

  it('es idempotente: una segunda ejecución no cambia valores ya rellenados ni crea versiones nuevas', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListingWithVersions(db, sourceId, [
      { thumbnail: 'https://img4.idealista.com/foto.webp' },
    ]);

    const first = await backfillThumbnails(db);
    expect(first).toEqual({ updated: 1, skippedNoThumbnail: 0 });

    const versionsBefore = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));

    const second = await backfillThumbnails(db);
    expect(second).toEqual({ updated: 0, skippedNoThumbnail: 0 });

    const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
    expect(row?.thumbnailUrl).toBe('https://img4.idealista.com/foto.webp');

    const versionsAfter = await db.select().from(listingVersions).where(eq(listingVersions.listingId, listingId));
    expect(versionsAfter).toHaveLength(versionsBefore.length);
  });
});

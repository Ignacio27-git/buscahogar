// REQ-SCHEMA-02, REQ-SCHEMA-03, REQ-SCHEMA-11: la cabeza vigente y el
// historial completo de un anuncio deben ser recuperables por separado, y la
// base de datos —no código de aplicación— debe impedir que haya más de una
// fila `is_current = true` por anuncio.
import { and, asc, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { listingVersions } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

describeWithDb('listing_versions: cabeza vigente e historial', () => {
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

  it('rechaza una segunda versión is_current=true del mismo anuncio (REQ-SCHEMA-03)', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);

    await db.insert(listingVersions).values({
      listingId,
      version: 1,
      isCurrent: true,
      priceCents: 200_000_00,
      operation: 'sale',
    });

    let caught: unknown;
    try {
      await db.insert(listingVersions).values({
        listingId,
        version: 2,
        isCurrent: true,
        priceCents: 195_000_00,
        operation: 'sale',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe('23505');
  });

  it('la vigente devuelve 1 fila y el historial devuelve 2, de más antigua a más nueva (REQ-SCHEMA-02, REQ-SCHEMA-11)', async () => {
    const sourceId = await insertSource(db);
    const listingId = await insertListing(db, sourceId);

    await db.insert(listingVersions).values({
      listingId,
      version: 1,
      isCurrent: false,
      priceCents: 200_000_00,
      operation: 'sale',
      capturedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.insert(listingVersions).values({
      listingId,
      version: 2,
      isCurrent: true,
      priceCents: 195_000_00,
      operation: 'sale',
      capturedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const current = await db
      .select()
      .from(listingVersions)
      .where(and(eq(listingVersions.listingId, listingId), eq(listingVersions.isCurrent, true)));
    expect(current).toHaveLength(1);
    expect(current[0]?.version).toBe(2);
    // El precio anterior (v1) permanece intacto: un cambio de precio añade
    // una fila nueva, nunca actualiza la existente (CLAUDE.md).
    expect(current[0]?.priceCents).toBe(195_000_00);

    const history = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.listingId, listingId))
      .orderBy(asc(listingVersions.capturedAt));
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.version)).toEqual([1, 2]);
    expect(history.map((row) => row.priceCents)).toEqual([200_000_00, 195_000_00]);
  });
});

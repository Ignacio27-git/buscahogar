// ROADMAP 3.4 (decisión 258, parte 2; D14b) — el arrendamiento de un job `running`: `claimJob` lo fija con el
// reloj de la BASE DE DATOS y `persistPage` lo renueva en la MISMA transacción que avanza el cursor. Contra
// PostgreSQL real (sin describeWithDb: DATABASE_URL la garantiza el setupFile de esta config).
import { randomUUID } from 'node:crypto';

import { coverageJobs } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import type { Listing } from '@buscahogar/core';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { rawElementSchema } from '../../src/sources/idealista/raw-element.schema.js';
import { createCoverageStore } from '../../src/sweep/coverage-store.js';
import { createListingWriter } from '../../src/sweep/listing-writer.js';
import type { PersistPageItem } from '../../src/sweep/store.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

const FINGERPRINT = 'fp-lease';
const TOLERANCE_MS = 30_000;

function buildItem(externalId: string): PersistPageItem {
  const listing: Listing = {
    sourceId: 'idealista',
    externalId,
    url: 'https://www.idealista.com/inmueble/123',
    operation: 'rent',
    propertyType: 'flat',
    priceCents: 90_000,
    surfaceM2: 60,
    rooms: 2,
    bathrooms: 1,
    floor: '1',
    title: 'Piso',
    description: 'Piso',
    address: 'Calle 1',
    features: [],
  };
  const raw = rawElementSchema.parse({
    propertyCode: externalId,
    price: 900,
    propertyType: 'flat',
    operation: 'rent',
    url: listing.url,
  });
  return { listing, raw };
}

describe('arrendamiento de coverage_jobs (decisión 258, migración 0021)', () => {
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

  async function seed(): Promise<{ readonly zoneId: string; readonly sourceId: string }> {
    const { zoneId } = await insertLocationWithZone(db);
    return { zoneId, sourceId: await insertSource(db) };
  }

  async function lease(jobId: string): Promise<Date | null> {
    const [row] = await db
      .select({ leaseRenewedAt: coverageJobs.leaseRenewedAt })
      .from(coverageJobs)
      .where(eq(coverageJobs.id, jobId));
    return row?.leaseRenewedAt ?? null;
  }

  // Envejece el arrendamiento una hora para que "renovado" sea inequívoco frente al instante actual.
  async function ageLease(jobId: string): Promise<Date> {
    await pool.query(`update coverage_jobs set lease_renewed_at = now() - interval '1 hour' where id = $1`, [jobId]);
    const aged = await lease(jobId);
    if (aged === null) {
      throw new Error('el arrendamiento envejecido no se ha guardado');
    }
    return aged;
  }

  async function dbNowMs(): Promise<number> {
    const { rows } = await pool.query<{ now_ms: string }>(`select (extract(epoch from clock_timestamp()) * 1000)::bigint::text as now_ms`);
    return Number(rows[0]?.now_ms);
  }

  describe('claimJob', () => {
    it('un job NUEVO nace running con el arrendamiento fijado al reloj de la base de datos', async () => {
      const { zoneId, sourceId } = await seed();
      const claimed = await createCoverageStore(db).claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      const renewed = await lease(claimed.id);
      expect(renewed).not.toBeNull();
      expect(Math.abs((renewed?.getTime() ?? 0) - (await dbNowMs()))).toBeLessThan(TOLERANCE_MS);
    });

    it('reclamar un job EXISTENTE (failed) renueva el arrendamiento envejecido', async () => {
      const { zoneId, sourceId } = await seed();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.finishJob(first.id, { kind: 'transport-failed', resumeCursor: 'homes:2', error: 'boom' });
      const aged = await ageLease(first.id);

      await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      const renewed = await lease(first.id);
      expect(renewed?.getTime()).toBeGreaterThan(aged.getTime() + 3_000_000);
      expect(Math.abs((renewed?.getTime() ?? 0) - (await dbNowMs()))).toBeLessThan(TOLERANCE_MS);
    });
  });

  describe('persistPage', () => {
    async function claimedJob(): Promise<{ readonly jobId: string; readonly sourceId: string }> {
      const { zoneId, sourceId } = await seed();
      const claimed = await createCoverageStore(db).claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      return { jobId: claimed.id, sourceId };
    }

    it('al avanzar el cursor renueva el arrendamiento en la misma transacción', async () => {
      const { jobId, sourceId } = await claimedJob();
      const aged = await ageLease(jobId);

      await createListingWriter(db).persistPage({
        jobId,
        sourceUuid: sourceId,
        items: [buildItem('lease-1')],
        nextCursor: 'homes:2',
        fingerprint: FINGERPRINT,
      });

      const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      expect(row?.cursor).not.toBeNull();
      expect(row?.leaseRenewedAt?.getTime()).toBeGreaterThan(aged.getTime() + 3_000_000);
      expect(Math.abs((row?.leaseRenewedAt?.getTime() ?? 0) - (await dbNowMs()))).toBeLessThan(TOLERANCE_MS);
    });

    it('una página que falla revierte TAMBIÉN el arrendamiento (ni cursor ni arrendamiento avanzan)', async () => {
      const { jobId } = await claimedJob();
      const aged = await ageLease(jobId);
      const [before] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));

      // Fuente inexistente: la clave foránea hace fallar el upsert de identidad dentro de la transacción.
      await expect(
        createListingWriter(db).persistPage({
          jobId,
          sourceUuid: randomUUID(),
          items: [buildItem('lease-fail')],
          nextCursor: 'homes:2',
          fingerprint: FINGERPRINT,
        })
      ).rejects.toThrow();

      const [after] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      expect(after?.cursor).toBe(before?.cursor);
      expect(after?.leaseRenewedAt?.getTime()).toBe(aged.getTime());
    });

    it('la última página (sin cursor siguiente) no toca el arrendamiento: lo cierra finishJob', async () => {
      const { jobId, sourceId } = await claimedJob();
      const aged = await ageLease(jobId);

      await createListingWriter(db).persistPage({
        jobId,
        sourceUuid: sourceId,
        items: [buildItem('lease-last')],
        nextCursor: undefined,
        fingerprint: FINGERPRINT,
      });

      expect((await lease(jobId))?.getTime()).toBe(aged.getTime());
    });
  });
});

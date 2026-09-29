// ROADMAP 1.13 Unit C (diseño DD-17/DD-18, paso 1 y paso 3 de la tabla del
// tick) — selección del siguiente trabajo reclamable y marcado de un
// trabajo fallido ANTES de reclamarlo. Contra PostgreSQL real, mismo
// patrón que coverage-store.db.test.ts (sin describeWithDb: DATABASE_URL
// ya está garantizada por el setupFile de esta config, D2).
import { coverageJobs } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { markJobFailedWithoutClaim, selectNextClaimableJob } from '../../src/sweep/job-selection.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

describe('job-selection — DD-18 paso 1 (selectNextClaimableJob) y paso 3 (markJobFailedWithoutClaim)', () => {
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

  it('sin ningún trabajo, devuelve null', async () => {
    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('un trabajo pending es seleccionable', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [row] = await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'pending' }).returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);
    // ROADMAP 2.5 (S1): el job lleva ahora su carril; sin `refresh_requested_at`
    // es a demanda.
    expect(job).toEqual({ jobId: row?.id, zoneId, sourceId, lane: 'on-demand' });
  });

  it('un trabajo failed con reintentos restantes (attempts < maxAttempts) es seleccionable', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [row] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, status: 'failed', attempts: 1 })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);
    expect(job?.jobId).toBe(row?.id);
  });

  it('un trabajo failed SIN reintentos restantes (attempts >= maxAttempts) NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'failed', attempts: 3 });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('un trabajo running NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'running' });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('un trabajo done NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'done' });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('con varios trabajos seleccionables, elige el más antiguo por requested_at', async () => {
    const { zoneId: zoneIdA } = await insertLocationWithZone(db, { ineCode: '10001' });
    const { zoneId: zoneIdB } = await insertLocationWithZone(db, { ineCode: '10002' });
    const sourceId = await insertSource(db);

    const [older] = await db
      .insert(coverageJobs)
      .values({ zoneId: zoneIdA, sourceId, status: 'pending', requestedAt: new Date('2026-01-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });
    await db
      .insert(coverageJobs)
      .values({ zoneId: zoneIdB, sourceId, status: 'pending', requestedAt: new Date('2026-06-01T00:00:00Z') });

    const job = await selectNextClaimableJob(db, 3);
    expect(job?.jobId).toBe(older?.id);
  });

  // ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, ZRS-10, S-ZRS-11)
  // — carril de refresco: un job con `refresh_requested_at` NO nulo se
  // selecciona DESPUÉS de cualquier trabajo a demanda, aunque sea más antiguo.
  it('S-ZRS-11: con un job de refresco MÁS ANTIGUO y uno a demanda pendientes, se elige primero el de demanda', async () => {
    const { zoneId: refreshZone } = await insertLocationWithZone(db, { ineCode: '10011' });
    const { zoneId: demandZone } = await insertLocationWithZone(db, { ineCode: '10012' });
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({
      zoneId: refreshZone,
      sourceId,
      status: 'pending',
      requestedAt: new Date('2026-01-01T00:00:00Z'),
      refreshRequestedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const [demand] = await db
      .insert(coverageJobs)
      .values({ zoneId: demandZone, sourceId, status: 'pending', requestedAt: new Date('2026-06-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);

    expect(job?.jobId).toBe(demand?.id);
    expect(job?.lane).toBe('on-demand');
  });

  it('un job de refresco pendiente SOLO (sin demanda) se selecciona y lleva lane "refresh"', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [refresh] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, status: 'pending', refreshRequestedAt: new Date('2026-09-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);

    expect(job).toEqual({ jobId: refresh?.id, zoneId, sourceId, lane: 'refresh' });
  });

  it('entre dos jobs de refresco, el orden sigue siendo por requested_at (el más antiguo primero)', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '10021' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '10022' });
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({
      zoneId: zoneB,
      sourceId,
      status: 'pending',
      requestedAt: new Date('2026-06-01T00:00:00Z'),
      refreshRequestedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const [older] = await db
      .insert(coverageJobs)
      .values({
        zoneId: zoneA,
        sourceId,
        status: 'pending',
        requestedAt: new Date('2026-01-01T00:00:00Z'),
        refreshRequestedAt: new Date('2026-09-02T00:00:00Z'),
      })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);

    expect(job?.jobId).toBe(older?.id);
  });

  it('markJobFailedWithoutClaim marca failed con el motivo nombrado, sin tocar attempts', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [row] = await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'pending' }).returning({ id: coverageJobs.id });
    if (!row) throw new Error('fixture no insertado');

    await markJobFailedWithoutClaim(db, row.id, 'zona sin centroide (DD-5)');

    const [after] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, row.id));
    expect(after?.status).toBe('failed');
    expect(after?.error).toBe('zona sin centroide (DD-5)');
    expect(after?.attempts).toBe(0);
    expect(after?.finishedAt).not.toBeNull();
  });
});

// Paso 1.7 — coverage-store.ts (diseño D6, D7; COVERAGE-1..6). Contra
// PostgreSQL real; sin describeWithDb (D2, resuelve D-a) — DATABASE_URL ya
// está garantizada por el setupFile de esta config.
import { coverageJobs, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decodeJobCursor } from '../../src/sweep/job-cursor.js';
import { createCoverageStore, JobAlreadyClaimedError } from '../../src/sweep/coverage-store.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

const FINGERPRINT = 'fp-abc123';

describe('coverage-store — COVERAGE-1..6, D6, D7', () => {
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

  async function seedZoneAndSource(): Promise<{ readonly zoneId: string; readonly sourceId: string }> {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    return { zoneId, sourceId };
  }

  it('COVERAGE-1a: una zona/fuente sin barrido previo crea una fila coverage_jobs antes de la primera petición', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);

    const claimed = await store.claimJob(zoneId, sourceId, FINGERPRINT);

    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(row?.status).toBe('running');
    expect(claimed.cursor).toBeUndefined();
  });

  it('COVERAGE-3a: un segundo reclamo concurrente falla y no emite ninguna petición adicional', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);

    await store.claimJob(zoneId, sourceId, FINGERPRINT);

    await expect(store.claimJob(zoneId, sourceId, FINGERPRINT)).rejects.toThrow(JobAlreadyClaimedError);

    const rows = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(rows).toHaveLength(1);
  });

  it('COVERAGE-5a: el agotamiento del tope deja el trabajo reanudable, ni done ni failed', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, FINGERPRINT);

    await store.finishJob(claimed.id, { kind: 'budget-exhausted', resumeCursor: 'homes:4' });

    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(row?.status).toBe('pending');
    expect(row?.cursor).not.toBeNull();
    expect(decodeJobCursor(row?.cursor ?? '', FINGERPRINT)).toBe('homes:4');

    // Reanudación: un reclamo posterior tiene éxito y devuelve el cursor persistido.
    const resumed = await store.claimJob(zoneId, sourceId, FINGERPRINT);
    expect(resumed.cursor).toBe('homes:4');
  });

  it('COVERAGE-4a: un fallo de transporte marca failed, registra el error, incrementa attempts y conserva el cursor', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, FINGERPRINT);

    await store.finishJob(claimed.id, {
      kind: 'transport-failed',
      resumeCursor: 'offices:2',
      error: 'fallo de transporte simulado',
    });

    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('fallo de transporte simulado');
    expect(row?.attempts).toBe(1);
    expect(decodeJobCursor(row?.cursor ?? '', FINGERPRINT)).toBe('offices:2');
  });

  it('InvalidCursorError marca failed y NUNCA limpia el cursor ya persistido', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const firstClaim = await store.claimJob(zoneId, sourceId, FINGERPRINT);
    await store.finishJob(firstClaim.id, { kind: 'budget-exhausted', resumeCursor: 'homes:7' });
    const [beforeFailure] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, firstClaim.id));

    const secondClaim = await store.claimJob(zoneId, sourceId, FINGERPRINT);
    await store.finishJob(secondClaim.id, { kind: 'invalid-cursor', error: 'cursor corrupto' });

    const [afterFailure] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, secondClaim.id));
    expect(afterFailure?.status).toBe('failed');
    expect(afterFailure?.error).toBe('cursor corrupto');
    expect(afterFailure?.cursor).toBe(beforeFailure?.cursor);
  });

  it('COVERAGE-6a: un barrido completado actualiza zones.last_swept_at y state=covered', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, FINGERPRINT);

    await store.finishJob(claimed.id, { kind: 'completed' });

    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(job?.status).toBe('done');

    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('covered');
    expect(zone?.lastSweptAt).not.toBeNull();
  });

  it('una inserción duplicada de coverage_jobs pendiente para la misma zona+fuente es rechazada por el índice único de la BD', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'pending' });

    await expect(
      pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status) VALUES ($1, $2, 'pending')`, [
        zoneId,
        sourceId,
      ])
    ).rejects.toMatchObject({ code: '23505' });
  });
});

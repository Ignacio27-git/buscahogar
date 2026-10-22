// ROADMAP 3.4 (decisión 258, parte 2; D14b) — `reclaimStaleRunningJobs`: un job `running` cuyo arrendamiento
// caducó (worker matado sin cierre ordenado) pasa a `failed` conservando cursor y ciclo, de modo que
// `COVERAGE_JOB_MAX_ATTEMPTS` acota los reinicios de un job que mata al worker. Contra PostgreSQL real.
import { COVERAGE_JOB_MAX_ATTEMPTS } from '@buscahogar/core';
import { coverageJobs, dailyRequestBudget } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { selectNextClaimableJob } from '../../src/sweep/job-selection.js';
import {
  DEFAULT_STALE_RUNNING_JOB_AFTER_MS,
  reclaimStaleRunningJobs,
  STALE_RECLAIM_BATCH_LIMIT,
  STALE_RUNNING_ERROR,
} from '../../src/sweep/stale-job-reclaim.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

const STALE_AFTER_MS = 900_000;

interface RunningJobOverrides extends Partial<typeof coverageJobs.$inferInsert> {
  // Antigüedad (ms, reloj de la base de datos) del arrendamiento / del inicio. null o ausente = NULL.
  readonly leaseAgoMs?: number | null;
  readonly startedAgoMs?: number | null;
}

describe('reclaimStaleRunningJobs (decisión 258, D14b)', () => {
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

  async function insertRunning(sourceId: string, overrides: RunningJobOverrides): Promise<string> {
    const { zoneId } = await insertLocationWithZone(db);
    const { leaseAgoMs, startedAgoMs, ...values } = overrides;
    const [row] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'rent', status: 'running', attempts: 1, ...values })
      .returning({ id: coverageJobs.id });
    const id = row?.id ?? '';
    // Las marcas se fijan con el reloj de la BASE DE DATOS (el mismo que usa el reclamo).
    await pool.query(
      `update coverage_jobs
         set lease_renewed_at = case when $2::bigint is null then null else now() - ($2::bigint * interval '1 millisecond') end,
             started_at = case when $3::bigint is null then null else now() - ($3::bigint * interval '1 millisecond') end
       where id = $1`,
      [id, leaseAgoMs ?? null, startedAgoMs ?? null]
    );
    return id;
  }

  async function rowOf(id: string): Promise<typeof coverageJobs.$inferSelect | undefined> {
    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, id));
    return row;
  }

  it('las constantes por defecto: 15 minutos, un lote acotado y el error fijo', () => {
    expect(DEFAULT_STALE_RUNNING_JOB_AFTER_MS).toBe(900_000);
    expect(STALE_RECLAIM_BATCH_LIMIT).toBeGreaterThan(0);
    expect(STALE_RUNNING_ERROR).toBe('stale-running-reclaimed');
  });

  it('un running con el arrendamiento caducado pasa a failed, con finished_at, el error fijo y los ids devueltos', async () => {
    const sourceId = await insertSource(db);
    const stale = await insertRunning(sourceId, { leaseAgoMs: STALE_AFTER_MS + 60_000, cursor: 'cursor-opaco' });

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect(reclaimed).toEqual([stale]);
    const row = await rowOf(stale);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('stale-running-reclaimed');
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });

  it('conserva el cursor, cycle_started_at y attempts (la reanudación continúa donde quedó)', async () => {
    const sourceId = await insertSource(db);
    const cycleStartedAt = new Date('2026-05-01T08:00:00Z');
    const stale = await insertRunning(sourceId, {
      leaseAgoMs: STALE_AFTER_MS + 1_000,
      cursor: 'cursor-opaco',
      cycleStartedAt,
      attempts: 2,
    });

    await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    const row = await rowOf(stale);
    expect(row?.cursor).toBe('cursor-opaco');
    expect(row?.cycleStartedAt?.getTime()).toBe(cycleStartedAt.getTime());
    expect(row?.attempts).toBe(2);
  });

  it('un running con arrendamiento reciente no se toca, aunque lleve mucho tiempo iniciado', async () => {
    const sourceId = await insertSource(db);
    const alive = await insertRunning(sourceId, {
      leaseAgoMs: STALE_AFTER_MS - 120_000,
      startedAgoMs: 10 * STALE_AFTER_MS,
    });

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect(reclaimed).toEqual([]);
    expect((await rowOf(alive))?.status).toBe('running');
    expect((await rowOf(alive))?.error).toBeNull();
  });

  it('sin arrendamiento (NULL) cuenta started_at; si tampoco hay, requested_at', async () => {
    const sourceId = await insertSource(db);
    const oldStart = await insertRunning(sourceId, { leaseAgoMs: null, startedAgoMs: STALE_AFTER_MS + 5_000 });
    const freshStart = await insertRunning(sourceId, { leaseAgoMs: null, startedAgoMs: 1_000 });
    // started_at NULL: requested_at (por defecto "ahora") es reciente → no se reclama; envejecido → sí.
    const noMarksFresh = await insertRunning(sourceId, { leaseAgoMs: null, startedAgoMs: null });
    const noMarksOld = await insertRunning(sourceId, { leaseAgoMs: null, startedAgoMs: null });
    await pool.query(`update coverage_jobs set requested_at = now() - interval '2 hours' where id = $1`, [noMarksOld]);

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect([...reclaimed].sort()).toEqual([oldStart, noMarksOld].sort());
    expect((await rowOf(freshStart))?.status).toBe('running');
    expect((await rowOf(noMarksFresh))?.status).toBe('running');
  });

  it('el arrendamiento manda sobre started_at: lease reciente + started_at antiguo vive; lease caducado + started_at reciente se reclama', async () => {
    const sourceId = await insertSource(db);
    const alive = await insertRunning(sourceId, { leaseAgoMs: 1_000, startedAgoMs: 3 * STALE_AFTER_MS });
    const dead = await insertRunning(sourceId, { leaseAgoMs: STALE_AFTER_MS + 1_000, startedAgoMs: 1_000 });

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect(reclaimed).toEqual([dead]);
    expect((await rowOf(alive))?.status).toBe('running');
  });

  it('solo toca running: pending, done y failed con marcas antiguas quedan intactos', async () => {
    const sourceId = await insertSource(db);
    const ids: string[] = [];
    for (const status of ['pending', 'done', 'failed'] as const) {
      ids.push(
        await insertRunning(sourceId, { status, leaseAgoMs: 10 * STALE_AFTER_MS, startedAgoMs: 10 * STALE_AFTER_MS })
      );
    }

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect(reclaimed).toEqual([]);
    expect((await Promise.all(ids.map(rowOf))).map((row) => row?.status)).toEqual(['pending', 'done', 'failed']);
    expect((await rowOf(ids[2] ?? ''))?.error).toBeNull();
  });

  it('el lote es acotado: con límite 2 y 3 caducados reclama 2 y el tercero en la siguiente pasada', async () => {
    const sourceId = await insertSource(db);
    for (let index = 0; index < 3; index += 1) {
      await insertRunning(sourceId, { leaseAgoMs: STALE_AFTER_MS + 1_000 + index });
    }

    const first = await reclaimStaleRunningJobs(db, STALE_AFTER_MS, 2);
    const second = await reclaimStaleRunningJobs(db, STALE_AFTER_MS, 2);
    const third = await reclaimStaleRunningJobs(db, STALE_AFTER_MS, 2);

    expect([first.length, second.length, third.length]).toEqual([2, 1, 0]);
    expect(new Set([...first, ...second]).size).toBe(3);
  });

  it('COVERAGE_JOB_MAX_ATTEMPTS acota un job que mata al worker: se reclama y reselecciona hasta quedar excluido', async () => {
    const sourceId = await insertSource(db);
    const poison = await insertRunning(sourceId, {
      leaseAgoMs: STALE_AFTER_MS + 1_000,
      attempts: 1,
      cursor: 'cursor-opaco',
    });

    for (let attempt = 1; attempt < COVERAGE_JOB_MAX_ATTEMPTS; attempt += 1) {
      expect(await reclaimStaleRunningJobs(db, STALE_AFTER_MS)).toEqual([poison]);
      const selected = await selectNextClaimableJob(db, COVERAGE_JOB_MAX_ATTEMPTS);
      expect(selected?.jobId).toBe(poison);
      // El worker lo reclama otra vez (attempts + 1) y vuelve a morir sin renovar el arrendamiento.
      await pool.query(
        `update coverage_jobs set status = 'running', attempts = attempts + 1, lease_renewed_at = now() - interval '1 hour' where id = $1`,
        [poison]
      );
    }

    expect(await reclaimStaleRunningJobs(db, STALE_AFTER_MS)).toEqual([poison]);
    expect((await rowOf(poison))?.attempts).toBe(COVERAGE_JOB_MAX_ATTEMPTS);
    // Con el tope alcanzado ya no es seleccionable: el job venenoso se detiene.
    expect(await selectNextClaimableJob(db, COVERAGE_JOB_MAX_ATTEMPTS)).toBeNull();
  });

  it('no toca el registro de cuota: la reserva diaria queda idéntica', async () => {
    const sourceId = await insertSource(db);
    await db
      .insert(dailyRequestBudget)
      .values({ day: '2026-10-22', sourceId, searchRequests: 7, tokenRequests: 1, searchCap: 100 });
    const before = await db.select().from(dailyRequestBudget);
    await insertRunning(sourceId, { leaseAgoMs: STALE_AFTER_MS + 1_000 });

    const reclaimed = await reclaimStaleRunningJobs(db, STALE_AFTER_MS);

    expect(reclaimed).toHaveLength(1);
    expect(before).toHaveLength(1);
    expect(await db.select().from(dailyRequestBudget)).toEqual(before);
  });
});

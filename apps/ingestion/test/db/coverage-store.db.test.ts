// Paso 1.7 — coverage-store.ts (diseño D6, D7; COVERAGE-1..6). Contra
// PostgreSQL real; sin describeWithDb (D2, resuelve D-a) — DATABASE_URL ya
// está garantizada por el setupFile de esta config.
import { coverageJobs, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decodeJobCursor } from '../../src/sweep/job-cursor.js';
import { createCoverageStore, JobAlreadyClaimedError } from '../../src/sweep/coverage-store.js';
import type { CoverageStore } from '../../src/sweep/coverage-store.js';
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

    const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(row?.status).toBe('running');
    expect(claimed.cursor).toBeUndefined();
  });

  it('COVERAGE-3a: un segundo reclamo concurrente falla y no emite ninguna petición adicional', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);

    await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

    await expect(store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT)).rejects.toThrow(JobAlreadyClaimedError);

    const rows = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(rows).toHaveLength(1);
  });

  it('COVERAGE-5a: el agotamiento del tope deja el trabajo reanudable, ni done ni failed', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

    await store.finishJob(claimed.id, { kind: 'budget-exhausted', resumeCursor: 'homes:4' });

    const [row] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(row?.status).toBe('pending');
    expect(row?.cursor).not.toBeNull();
    expect(decodeJobCursor(row?.cursor ?? '', FINGERPRINT)).toBe('homes:4');

    // Reanudación: un reclamo posterior tiene éxito y devuelve el cursor persistido.
    const resumed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
    expect(resumed.cursor).toBe('homes:4');
  });

  it('COVERAGE-4a: un fallo de transporte marca failed, registra el error, incrementa attempts y conserva el cursor', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

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
    const firstClaim = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
    await store.finishJob(firstClaim.id, { kind: 'budget-exhausted', resumeCursor: 'homes:7' });
    const [beforeFailure] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, firstClaim.id));

    const secondClaim = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
    await store.finishJob(secondClaim.id, { kind: 'invalid-cursor', error: 'cursor corrupto' });

    const [afterFailure] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, secondClaim.id));
    expect(afterFailure?.status).toBe('failed');
    expect(afterFailure?.error).toBe('cursor corrupto');
    expect(afterFailure?.cursor).toBe(beforeFailure?.cursor);
  });

  it('COVERAGE-6a: un barrido completado actualiza zones.last_swept_at y state=covered', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    const store = createCoverageStore(db);
    const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

    await store.finishJob(claimed.id, { kind: 'completed' });

    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
    expect(job?.status).toBe('done');

    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('covered');
    expect(zone?.lastSweptAt).not.toBeNull();
  });

  // ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104) — la marca del
  // carril de refresco (`refresh_requested_at`) sobrevive a todo excepto a un
  // ciclo COMPLETADO: un barrido reanudable o fallido sigue siendo de refresco
  // (el trabajo reanudado no salta al carril de la demanda).
  describe('refresh_requested_at — carril de refresco (ZRS-10, decisión 104)', () => {
    // El almacén cachea la huella de área por instancia: el mismo `store` que
    // reclama debe cerrar el job.
    async function claimRefreshJob(): Promise<{ readonly jobId: string; readonly store: CoverageStore }> {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const [row] = await db
        .insert(coverageJobs)
        .values({
          zoneId,
          sourceId,
          operation: 'rent',
          status: 'pending',
          refreshRequestedAt: new Date('2026-09-01T00:00:00Z'),
        })
        .returning({ id: coverageJobs.id });
      if (!row) throw new Error('fixture no insertado');
      const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      expect(claimed.id).toBe(row.id);
      return { jobId: row.id, store };
    }

    it('finishJob(completed) LIMPIA refresh_requested_at: el job vuelve a estado "a demanda" hasta el próximo refresco', async () => {
      const { jobId, store } = await claimRefreshJob();

      await store.finishJob(jobId, { kind: 'completed' });

      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      expect(job?.status).toBe('done');
      expect(job?.refreshRequestedAt).toBeNull();
    });

    it('budget-exhausted CONSERVA refresh_requested_at (el trabajo reanudado sigue en el carril de refresco)', async () => {
      const { jobId, store } = await claimRefreshJob();

      await store.finishJob(jobId, { kind: 'budget-exhausted', resumeCursor: 'homes:2' });

      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      expect(job?.status).toBe('pending');
      expect(job?.refreshRequestedAt).not.toBeNull();
    });

    it('transport-failed CONSERVA refresh_requested_at (el reintento sigue siendo de refresco)', async () => {
      const { jobId, store } = await claimRefreshJob();

      await store.finishJob(jobId, { kind: 'transport-failed', resumeCursor: 'homes:1', error: 'timeout simulado' });

      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      expect(job?.status).toBe('failed');
      expect(job?.refreshRequestedAt).not.toBeNull();
    });

    it('un job a demanda (refresh_requested_at NULL) sigue con NULL tras completarse — sin efectos colaterales', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      await store.finishJob(claimed.id, { kind: 'completed' });

      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, claimed.id));
      expect(job?.refreshRequestedAt).toBeNull();
    });
  });

  // ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — `cycle_started_at`
  // marca el inicio del ciclo de barrido: lo fija `claimJob` SOLO con cursor
  // NULL y sobrevive a las reanudaciones, de modo que un ciclo que abarca varios
  // ticks tiene un único inicio (S-ZRS-17).
  describe('cycle_started_at — inicio del ciclo (S-ZRS-17, decisión 105)', () => {
    async function cycleStartedAt(jobId: string): Promise<Date | null> {
      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
      return job?.cycleStartedAt ?? null;
    }

    it('el primer reclamo (sin fila previa) fija cycle_started_at', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const before = Date.now();

      const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      const started = await cycleStartedAt(claimed.id);
      expect(started).not.toBeNull();
      expect(started?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    });

    it('S-ZRS-17: un ciclo interrumpido por presupuesto y reanudado conserva el cycle_started_at del primer tick', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      const tickOneStart = await cycleStartedAt(first.id);
      await store.finishJob(first.id, { kind: 'budget-exhausted', resumeCursor: 'homes:4' });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const resumed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      expect(resumed.cursor).toBe('homes:4');
      expect((await cycleStartedAt(resumed.id))?.getTime()).toBe(tickOneStart?.getTime());
    });

    it('un fallo de transporte con cursor también conserva el inicio del ciclo al reintentar', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      const initial = await cycleStartedAt(first.id);
      await store.finishJob(first.id, { kind: 'transport-failed', resumeCursor: 'homes:2', error: 'timeout simulado' });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const retried = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      expect((await cycleStartedAt(retried.id))?.getTime()).toBe(initial?.getTime());
    });

    it('un ciclo nuevo (job done con cursor NULL, p. ej. un refresco) fija un cycle_started_at posterior', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      const oldStart = await cycleStartedAt(first.id);
      await store.finishJob(first.id, { kind: 'completed' });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const second = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      const newStart = await cycleStartedAt(second.id);
      expect(second.cursor).toBeUndefined();
      expect(newStart?.getTime()).toBeGreaterThan(oldStart?.getTime() ?? Number.POSITIVE_INFINITY);
    });

    it('finishJob(completed) conserva cycle_started_at: markAbsenceCandidates lo necesita después de cerrar', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const claimed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      const started = await cycleStartedAt(claimed.id);

      await store.finishJob(claimed.id, { kind: 'completed' });

      expect((await cycleStartedAt(claimed.id))?.getTime()).toBe(started?.getTime());
    });

    it('un job previo a 0015 (cycle_started_at NULL) con cursor guardado se reanuda SIN inventar un inicio', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.finishJob(first.id, { kind: 'budget-exhausted', resumeCursor: 'homes:3' });
      await db.update(coverageJobs).set({ cycleStartedAt: null }).where(eq(coverageJobs.id, first.id));

      const resumed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      expect(resumed.cursor).toBe('homes:3');
      expect(await cycleStartedAt(resumed.id)).toBeNull();
    });
  });

  // ROADMAP 3.3 (prescan-top-cities, PR2; decisión 250) — los jobs son POR OPERACIÓN
  // y la cobertura de (zona, operación) es `last_completed_at`.
  describe('operación y last_completed_at (R9, R11, decisión 250)', () => {
    async function jobOf(
      zoneId: string,
      sourceId: string,
      operation: string
    ): Promise<typeof coverageJobs.$inferSelect | undefined> {
      const [job] = await db
        .select()
        .from(coverageJobs)
        .where(and(eq(coverageJobs.zoneId, zoneId), eq(coverageJobs.sourceId, sourceId), eq(coverageJobs.operation, operation)));
      return job;
    }

    it('reclamar sale y rent de la misma zona crea dos jobs independientes, cada uno con su operación', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);

      const rent = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      const sale = await store.claimJob(zoneId, sourceId, 'sale', 'fp-sale');

      expect(sale.id).not.toBe(rent.id);
      expect((await jobOf(zoneId, sourceId, 'rent'))?.id).toBe(rent.id);
      expect((await jobOf(zoneId, sourceId, 'sale'))?.id).toBe(sale.id);
    });

    it('reclamar un job running de rent no impide reclamar el de sale, pero un segundo reclamo de rent sí falla', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);

      await expect(store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT)).rejects.toThrow(JobAlreadyClaimedError);
      await store.claimJob(zoneId, sourceId, 'sale', FINGERPRINT);
      expect((await jobOf(zoneId, sourceId, 'sale'))?.status).toBe('running');
      expect((await jobOf(zoneId, sourceId, 'rent'))?.status).toBe('running');
    });

    it('finishJob(completed) fija last_completed_at solo en el job de ESA operación (S11.1)', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const rent = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.claimJob(zoneId, sourceId, 'sale', 'fp-sale');

      await store.finishJob(rent.id, { kind: 'completed' });

      expect((await jobOf(zoneId, sourceId, 'rent'))?.lastCompletedAt).toBeInstanceOf(Date);
      expect((await jobOf(zoneId, sourceId, 'sale'))?.lastCompletedAt).toBeNull();
    });

    it('un fallo, un presupuesto agotado o un refresco NO limpian last_completed_at', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const first = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.finishJob(first.id, { kind: 'completed' });
      const completedAt = (await jobOf(zoneId, sourceId, 'rent'))?.lastCompletedAt;
      expect(completedAt).toBeInstanceOf(Date);

      // Refresco: el job `done` vuelve a `pending` con cursor NULL y se reclama otra vez.
      await db
        .update(coverageJobs)
        .set({ status: 'pending', cursor: null, refreshRequestedAt: new Date() })
        .where(eq(coverageJobs.id, first.id));
      const refreshed = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.finishJob(refreshed.id, { kind: 'budget-exhausted', resumeCursor: 'homes:2' });
      expect((await jobOf(zoneId, sourceId, 'rent'))?.lastCompletedAt?.getTime()).toBe(completedAt?.getTime());

      const retried = await store.claimJob(zoneId, sourceId, 'rent', FINGERPRINT);
      await store.finishJob(retried.id, { kind: 'transport-failed', resumeCursor: 'homes:2', error: 'timeout' });
      expect((await jobOf(zoneId, sourceId, 'rent'))?.lastCompletedAt?.getTime()).toBe(completedAt?.getTime());
    });

    it('finishJob(completed) limpia presweep_requested_at (el trabajo parcial de un presweep terminó)', async () => {
      const { zoneId, sourceId } = await seedZoneAndSource();
      const store = createCoverageStore(db);
      const claimed = await store.claimJob(zoneId, sourceId, 'sale', FINGERPRINT);
      await db
        .update(coverageJobs)
        .set({ presweepRequestedAt: new Date('2026-10-01T00:00:00Z') })
        .where(eq(coverageJobs.id, claimed.id));

      await store.finishJob(claimed.id, { kind: 'budget-exhausted', resumeCursor: 'homes:2' });
      expect((await jobOf(zoneId, sourceId, 'sale'))?.presweepRequestedAt).not.toBeNull();

      const resumed = await store.claimJob(zoneId, sourceId, 'sale', FINGERPRINT);
      await store.finishJob(resumed.id, { kind: 'completed' });
      expect((await jobOf(zoneId, sourceId, 'sale'))?.presweepRequestedAt).toBeNull();
    });
  });

  it('una inserción duplicada de coverage_jobs pendiente para la misma zona+fuente es rechazada por el índice único de la BD', async () => {
    const { zoneId, sourceId } = await seedZoneAndSource();
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'pending' });

    await expect(
      pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'pending', 'rent')`, [
        zoneId,
        sourceId,
      ])
    ).rejects.toMatchObject({ code: '23505' });
  });
});

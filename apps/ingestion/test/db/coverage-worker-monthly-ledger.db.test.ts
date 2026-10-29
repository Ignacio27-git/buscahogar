// ROADMAP 3.3 (decisión 248; R6-R8, R14; S6.3, S8.x, S14.x) — los puertos REALES del worker
// reservan TODO gasto en el registro mensual por carril (`reserveRequestBudget`): demanda de
// usuario (on-demand), refresco y verificación de presencia (carril refresco). Contra
// PostgreSQL real con la fuente falsa (cero red). Sin fila mensual utilizable no se gasta nada,
// tampoco a demanda (fail-closed, decisión 066).
import { coverageJobs, geographyPointWkt } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import type { PollJob } from '../../src/sweep/job-selection.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource, seedMonthlyQuota } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const BLOCKING_THRESHOLDS = { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 };

function fakeElement(propertyCode: number): Record<string, unknown> {
  return {
    propertyCode,
    price: 100000 + propertyCode,
    propertyType: 'flat',
    operation: 'sale',
    url: `https://example.test/${String(propertyCode)}`,
    address: 'calle falsa 1',
    latitude: 37.18,
    longitude: -3.6,
  };
}

// Cinco filtros, una página cada uno: un barrido completo emite exactamente 5 peticiones.
function createExhaustingSearchPort(): IdealistaSearchPort & { readonly calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    search(): Promise<TransportOutcome> {
      state.calls += 1;
      return Promise.resolve({
        kind: 'ok',
        status: 200,
        headers: {},
        body: { elementList: [fakeElement(state.calls)], totalPages: 1, actualPage: 1, itemsPerPage: 50, total: 1 },
      });
    },
  };
}

// `totalPages` enorme: solo el tope duro del barrido (maxSearchRequestsPerSweep) puede detener el bucle.
function createNeverExhaustingSearchPort(): IdealistaSearchPort & { readonly calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    search(): Promise<TransportOutcome> {
      state.calls += 1;
      return Promise.resolve({
        kind: 'ok',
        status: 200,
        headers: {},
        body: { elementList: [fakeElement(state.calls)], totalPages: 999, actualPage: state.calls, itemsPerPage: 1, total: 999 },
      });
    },
  };
}

function createFakeTokenPort(): IdealistaTokenPort {
  return {
    acquire(): Promise<TransportOutcome> {
      return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
    },
  };
}

function options(overrides: Partial<CoverageWorkerOptions> = {}): CoverageWorkerOptions {
  return {
    pollIntervalMs: 1,
    maxSearchRequestsPerSweep: 10,
    dailySearchCap: 500,
    maxAttempts: 3,
    maxTicks: 1,
    ...overrides,
  };
}

interface MonthlyCounters extends Record<string, unknown> {
  readonly search_requests: number;
  readonly batch_requests: number;
  readonly on_demand_requests: number;
  readonly refresh_requests: number;
  readonly token_requests: number;
}

describe('puertos reales del worker — registro mensual por carril (decisión 248)', () => {
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

  function buildPorts(
    sourceUuid: string,
    searchPort: IdealistaSearchPort,
    overrides: { readonly dailySearchCap?: number; readonly refreshBudgetFraction?: number } = {}
  ): ReturnType<typeof createRealCoverageWorkerPorts> {
    return createRealCoverageWorkerPorts({
      db,
      sourceUuid,
      searchPort,
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: overrides.dailySearchCap ?? 500,
      ...(overrides.refreshBudgetFraction !== undefined ? { refreshBudgetFraction: overrides.refreshBudgetFraction } : {}),
      blockingThresholds: BLOCKING_THRESHOLDS,
      io: { log: (): void => undefined },
    });
  }

  async function counters(): Promise<MonthlyCounters | undefined> {
    const { rows } = await db.execute<MonthlyCounters>(sql`
      select search_requests, batch_requests, on_demand_requests, refresh_requests, token_requests
      from monthly_request_budget
    `);
    return rows[0];
  }

  async function dailySpent(): Promise<number> {
    const { rows } = await db.execute<{ total: number }>(
      sql`select coalesce(sum(search_requests), 0)::integer as total from daily_request_budget`
    );
    return rows[0]?.total ?? 0;
  }

  async function seedPendingJob(
    sourceId: string,
    kind: 'on-demand' | 'refresh'
  ): Promise<{ readonly zoneId: string }> {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    await db.insert(coverageJobs).values({
      zoneId,
      sourceId,
      operation: 'sale',
      status: 'pending',
      ...(kind === 'refresh' ? { refreshRequestedAt: new Date() } : {}),
    });
    return { zoneId };
  }

  it('S6.3/S14.4: un job a demanda SIN ninguna cuota mensual utilizable no gasta nada: cero peticiones, sigue pendiente y no hay escritura en el ledger', async () => {
    const sourceId = await insertSource(db);
    const { zoneId } = await seedPendingJob(sourceId, 'on-demand');
    const searchPort = createExhaustingSearchPort();

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.calls).toBe(0);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(job?.status).toBe('pending');
    expect(job?.attempts).toBe(0);
    expect(await counters()).toBeUndefined();
    expect(await dailySpent()).toBe(0);
  });

  it('un barrido a demanda COMPLETO registra el gasto real en el carril on-demand del mes (reservado 10, gastado 5) y en el diario', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
    await seedPendingJob(sourceId, 'on-demand');
    const searchPort = createExhaustingSearchPort();

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.calls).toBe(5);
    expect(await counters()).toMatchObject({
      search_requests: 5,
      on_demand_requests: 5,
      batch_requests: 0,
      refresh_requests: 0,
      token_requests: 1,
    });
    expect(await dailySpent()).toBe(5);
  });

  it('S14.1: con el fondo del batch agotado, el job a demanda se barre igualmente y gasta de la reserva', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });
    await seedPendingJob(sourceId, 'on-demand');
    const searchPort = createExhaustingSearchPort();

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.calls).toBe(5);
    expect(await counters()).toMatchObject({ search_requests: 75, on_demand_requests: 5, batch_requests: 70 });
  });

  it('S14.2: con el total mensual agotado el job a demanda NO se barre aunque el cupo diario sobre', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70, onDemand: 30 });
    const { zoneId } = await seedPendingJob(sourceId, 'on-demand');
    const searchPort = createExhaustingSearchPort();

    await runCoverageWorker(buildPorts(sourceId, searchPort, { dailySearchCap: 10_000 }), options({ dailySearchCap: 10_000 }));

    expect(searchPort.calls).toBe(0);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(job?.status).toBe('pending');
    expect(await counters()).toMatchObject({ search_requests: 100 });
    expect(await dailySpent()).toBe(0);
  });

  it('un job de refresco se registra en el carril refresh y comparte el fondo total - reserva', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
    await seedPendingJob(sourceId, 'refresh');
    const searchPort = createExhaustingSearchPort();

    await runCoverageWorker(
      buildPorts(sourceId, searchPort, { refreshBudgetFraction: 1 }),
      options({ refreshBudgetFraction: 1 })
    );

    expect(searchPort.calls).toBe(5);
    expect(await counters()).toMatchObject({ search_requests: 5, refresh_requests: 5, on_demand_requests: 0 });
  });

  it('S8.2: con el fondo agotado por el batch el refresco NO se barre (reserva intacta); el job a demanda sí', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });
    const refresh = await seedPendingJob(sourceId, 'refresh');
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, searchPort, { refreshBudgetFraction: 1 });

    expect(await ports.reserveBudget({ searchReserved: 10, tokenReserved: 1 }, 'refresh')).toBeNull();
    expect(await ports.reserveBudget({ searchReserved: 10, tokenReserved: 1 }, 'on-demand')).not.toBeNull();

    await runCoverageWorker(ports, options({ refreshBudgetFraction: 1 }));
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, refresh.zoneId));
    expect(job?.status).toBe('pending');
    expect(searchPort.calls).toBe(0);
  });

  it('S8.3: la verificación de presencia reserva en el carril refresh (mismo fondo) y la reconciliación devuelve a ese mes lo no gastado', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
    const ports = buildPorts(sourceId, createExhaustingSearchPort(), { refreshBudgetFraction: 1 });
    const reservation = { searchReserved: 2, tokenReserved: 1 };

    expect(await ports.reserveBudget(reservation, 'refresh')).not.toBeNull();
    expect(await counters()).toMatchObject({ search_requests: 2, refresh_requests: 2, token_requests: 1 });

    await ports.reconcileBudget(reservation, { search: 1, token: 1 });
    expect(await counters()).toMatchObject({ search_requests: 1, refresh_requests: 1, token_requests: 1 });
  });

  it('un job ya reclamado por otro proceso devuelve la reserva ENTERA al mes (cero peticiones emitidas)', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    // Otro proceso lo reclamó entre la selección y el reclamo: 'running' en la base, pero esta
    // instancia lo recibe de la selección fingida.
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'running' });
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, searchPort);
    const claimedElsewhere = {
      ...ports,
      selectNextJob: (): Promise<PollJob> =>
        Promise.resolve({ jobId: 'ignored', zoneId, sourceId, operation: 'sale', lane: 'on-demand' }),
    };

    await runCoverageWorker(claimedElsewhere, options());

    expect(searchPort.calls).toBe(0);
    expect(await counters()).toMatchObject({ search_requests: 0, on_demand_requests: 0, token_requests: 0 });
    expect(await dailySpent()).toBe(0);
  });
  // ROADMAP 3.3 (decisión 253; D11, R16; S16.1, S16.2) — promoción de jobs parciales del presweep.
  describe('jobs parciales del presweep (D11)', () => {
    async function seedPresweepJob(sourceId: string): Promise<{ readonly zoneId: string }> {
      const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
      await db.insert(coverageJobs).values({
        zoneId,
        sourceId,
        operation: 'sale',
        status: 'pending',
        presweepRequestedAt: new Date('2026-10-01T00:00:00Z'),
      });
      return { zoneId };
    }

    async function seedSignal(zoneId: string, ageInDays: number): Promise<void> {
      await pool.query("insert into zone_query_signals (zone_id, day) values ($1, (now() at time zone 'utc')::date - $2::int)", [
        zoneId,
        ageInDays,
      ]);
    }

    it('S16.1: con 1 día con señal el worker lo barre en el carril a demanda, GASTA LA RESERVA (fondo del batch agotado) y su reclamo limpia presweep_requested_at', async () => {
      const sourceId = await insertSource(db);
      await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });
      const { zoneId } = await seedPresweepJob(sourceId);
      await seedSignal(zoneId, 2);
      const searchPort = createNeverExhaustingSearchPort();

      await runCoverageWorker(buildPorts(sourceId, searchPort), options());

      // Tope duro del barrido = 10; sigue pendiente (reanudable) y ya no es trabajo del presweep.
      expect(searchPort.calls).toBe(10);
      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
      expect(job?.status).toBe('pending');
      expect(job?.cursor).not.toBeNull();
      expect(job?.presweepRequestedAt).toBeNull();
      expect(await counters()).toMatchObject({ search_requests: 80, on_demand_requests: 10, batch_requests: 70 });
    });

    it('S16.2: con señales solo antiguas el worker NO lo toca: cero peticiones, la marca y el ledger intactos', async () => {
      const sourceId = await insertSource(db);
      await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      const { zoneId } = await seedPresweepJob(sourceId);
      await seedSignal(zoneId, 30);
      const searchPort = createNeverExhaustingSearchPort();

      await runCoverageWorker(buildPorts(sourceId, searchPort), options());

      expect(searchPort.calls).toBe(0);
      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
      expect(job?.status).toBe('pending');
      expect(job?.attempts).toBe(0);
      expect(job?.presweepRequestedAt).toBeInstanceOf(Date);
      expect(await counters()).toMatchObject({ search_requests: 0 });
    });

    it('un job a demanda normal no cambia: el reclamo del worker no inventa ni limpia nada (marca NULL antes y después)', async () => {
      const sourceId = await insertSource(db);
      await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      const { zoneId } = await seedPendingJob(sourceId, 'on-demand');
      const searchPort = createExhaustingSearchPort();

      await runCoverageWorker(buildPorts(sourceId, searchPort), options());

      const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
      expect(job?.status).toBe('done');
      expect(job?.presweepRequestedAt).toBeNull();
    });
  });
});

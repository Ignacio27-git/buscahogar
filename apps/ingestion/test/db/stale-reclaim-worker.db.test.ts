// ROADMAP 3.4 (decisión 258, parte 2; D14b) — de extremo a extremo con los puertos REALES: un worker que arranca
// y encuentra un job `running` abandonado por un worker matado lo recupera en el primer tick y lo retoma (con
// puertos de Idealista falsos: cero red). Un job `running` con arrendamiento vivo no se toca.
import { coverageJobs, geographyPointWkt } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSourceWithQuota } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const BLOCKING_THRESHOLDS = { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 };
const OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 1,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
};

function createCountingSearchPort(): IdealistaSearchPort & { readonly calls: number } {
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
        body: {
          elementList: [
            {
              propertyCode: state.calls,
              price: 100000 + state.calls,
              propertyType: 'flat',
              operation: 'sale',
              url: `https://example.test/${String(state.calls)}`,
              address: 'calle falsa 1',
              latitude: 37.18,
              longitude: -3.6,
            },
          ],
          totalPages: 1,
          actualPage: 1,
          itemsPerPage: 50,
          total: 1,
        },
      });
    },
  };
}

const fakeTokenPort: IdealistaTokenPort = {
  acquire(): Promise<TransportOutcome> {
    return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
  },
};

describe('recuperación de jobs running abandonados con los puertos reales (decisión 258, D14b)', () => {
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

  async function seedRunningJob(leaseAgo: string): Promise<{ readonly jobId: string; readonly sourceId: string }> {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    const [row] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'sale', status: 'running', attempts: 1, startedAt: new Date() })
      .returning({ id: coverageJobs.id });
    const jobId = row?.id ?? '';
    await pool.query(`update coverage_jobs set lease_renewed_at = now() - $2::interval where id = $1`, [jobId, leaseAgo]);
    return { jobId, sourceId };
  }

  function portsFor(sourceId: string, searchPort: IdealistaSearchPort, logged: string[]): ReturnType<typeof createRealCoverageWorkerPorts> {
    return createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort,
      tokenPort: fakeTokenPort,
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: 500,
      blockingThresholds: BLOCKING_THRESHOLDS,
      staleRunningJobAfterMs: 120_000,
      io: { log: (line) => logged.push(line) },
    });
  }

  it('un job running con el arrendamiento caducado se recupera en el primer tick y se barre hasta completarse', async () => {
    const { jobId, sourceId } = await seedRunningJob('1 hour');
    const searchPort = createCountingSearchPort();
    const logged: string[] = [];

    await runCoverageWorker(portsFor(sourceId, searchPort, logged), OPTIONS);

    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    expect(job?.status).toBe('done');
    // attempts 1 (worker muerto) + 1 (este reclamo): el tope MAX_ATTEMPTS cuenta cada intento.
    expect(job?.attempts).toBe(2);
    expect(searchPort.calls).toBe(5);
    expect(logged.filter((line) => line.includes('stale-running-reclaimed'))).toHaveLength(1);
    expect(logged.join('\n')).toContain(`job_ids=${jobId}`);
  });

  it('un job running con el arrendamiento vivo no se toca: no se reclama, no se barre y no se registra nada', async () => {
    const { jobId, sourceId } = await seedRunningJob('10 seconds');
    const searchPort = createCountingSearchPort();
    const logged: string[] = [];

    await runCoverageWorker(portsFor(sourceId, searchPort, logged), OPTIONS);

    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    expect(job?.status).toBe('running');
    expect(job?.attempts).toBe(1);
    expect(searchPort.calls).toBe(0);
    expect(logged.filter((line) => line.includes('stale-running-reclaimed'))).toEqual([]);
  });
});

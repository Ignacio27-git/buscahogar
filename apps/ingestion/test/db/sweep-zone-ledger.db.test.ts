// ROADMAP 3.3 (decisión 248; D6b, D7; R4, R7) — el barrido MANUAL (`sweep-zone`) también pasa
// por `reserveRequestBudget`, en el carril batch: el tope duro del barrido es lo CONCEDIDO por
// el registro mensual (concesión parcial), no solo `--max-requests`; sin cuota utilizable o sin
// margen no se reclama ningún job ni se emite ninguna petición. El batch reserva solo contra
// el mes (D7). Contra PostgreSQL real con puertos falsos (cero red).
import { coverageJobs } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runSweepZone } from '../../scripts/sweep-zone.js';
import type { SweepEnv } from '../../scripts/sweep-zone.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import type { SweepOptions } from '../../src/sweep/options.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource, seedMonthlyQuota } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const INE_CODE = '18087';

function fakeElement(propertyCode: number): Record<string, unknown> {
  return {
    propertyCode,
    price: 100000 + propertyCode,
    propertyType: 'flat',
    operation: 'rent',
    url: `https://example.test/${String(propertyCode)}`,
    address: 'calle falsa 1',
    latitude: 37.18,
    longitude: -3.6,
  };
}

// `totalPages` enorme: solo el tope duro (lo concedido) puede detener el bucle.
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
        body: {
          elementList: [fakeElement(state.calls)],
          totalPages: 999,
          actualPage: state.calls,
          itemsPerPage: 1,
          total: 999,
        },
      });
    },
  };
}

// Cada filtro se agota tras una página: un barrido completo emite 5 peticiones de búsqueda.
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

const tokenPort: IdealistaTokenPort = {
  acquire(): Promise<TransportOutcome> {
    return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
  },
};

function sweepOptions(maxSearchRequestsPerSweep: number): SweepOptions {
  return { zone: INE_CODE, center: GRANADA, radiusMeters: 4500, operation: 'rent', maxSearchRequestsPerSweep };
}

describe('runSweepZone — gasto en el carril batch del registro mensual (decisión 248)', () => {
  let db: Database;
  let pool: Pool;
  const env: SweepEnv = { apiKey: 'no-usada', apiSecret: 'no-usada', databaseUrl: process.env.DATABASE_URL ?? '' };

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  async function seedSourceAndZone(): Promise<string> {
    await insertLocationWithZone(db, { ineCode: INE_CODE });
    return insertSource(db);
  }

  async function batchSpent(): Promise<{ search: number; batch: number; token: number } | undefined> {
    const { rows } = await db.execute<{ search: number; batch: number; token: number }>(sql`
      select search_requests as search, batch_requests as batch, token_requests as token from monthly_request_budget
    `);
    return rows[0];
  }

  async function dailyRows(): Promise<number> {
    const { rows } = await db.execute<{ total: number }>(sql`select count(*)::integer as total from daily_request_budget`);
    return rows[0]?.total ?? 0;
  }

  it('sin ninguna cuota mensual utilizable: salida 4, cero peticiones, ningún job reclamado, ledger intacto', async () => {
    await seedSourceAndZone();
    const searchPort = createNeverExhaustingSearchPort();
    const logged: string[] = [];

    const code = await runSweepZone(sweepOptions(10), env, { log: (line) => logged.push(line) }, { searchPort, tokenPort });

    expect(code).toBe(4);
    expect(searchPort.calls).toBe(0);
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(await batchSpent()).toBeUndefined();
    expect(logged.join('\n')).toContain('monthly-missing');
    expect(logged.join('\n')).toContain('set-monthly-quota');
  });

  it('D6b: con 2 de margen del batch y --max-requests 10 se emiten EXACTAMENTE 2 peticiones (concesión parcial) y quedan registradas', async () => {
    const sourceId = await seedSourceAndZone();
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 68 });
    const searchPort = createNeverExhaustingSearchPort();

    const code = await runSweepZone(sweepOptions(10), env, { log: () => undefined }, { searchPort, tokenPort });

    expect(code).toBe(0);
    expect(searchPort.calls).toBe(2);
    expect(await batchSpent()).toEqual({ search: 70, batch: 70, token: 1 });
  });

  it('con el margen del batch en 0: salida 4, cero peticiones y ningún job reclamado (aunque el total no esté agotado)', async () => {
    const sourceId = await seedSourceAndZone();
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });
    const searchPort = createNeverExhaustingSearchPort();

    const code = await runSweepZone(sweepOptions(10), env, { log: () => undefined }, { searchPort, tokenPort });

    expect(code).toBe(4);
    expect(searchPort.calls).toBe(0);
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(await batchSpent()).toEqual({ search: 70, batch: 70, token: 0 });
  });

  it('el gasto REAL manda: reservado 10, barrido de 5 peticiones, el ledger queda en 5 (la diferencia se devuelve)', async () => {
    const sourceId = await seedSourceAndZone();
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });
    const searchPort = createExhaustingSearchPort();

    const code = await runSweepZone(sweepOptions(10), env, { log: () => undefined }, { searchPort, tokenPort });

    expect(code).toBe(0);
    expect(searchPort.calls).toBe(5);
    expect(await batchSpent()).toEqual({ search: 5, batch: 5, token: 1 });
  });

  it('D7: el barrido manual reserva solo contra el mes — no escribe nada en el ledger diario', async () => {
    const sourceId = await seedSourceAndZone();
    await seedMonthlyQuota(db, sourceId, { totalCap: 100, reserve: 30 });

    await runSweepZone(sweepOptions(10), env, { log: () => undefined }, { searchPort: createExhaustingSearchPort(), tokenPort });

    expect(await dailyRows()).toBe(0);
  });
});

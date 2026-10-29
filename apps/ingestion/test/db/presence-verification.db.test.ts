// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — arnés de ejecución
// REAL de la verificación de presencia: `createRealCoverageWorkerPorts` +
// `runCoverageWorker` contra PostgreSQL real, con puertos de Idealista FALSOS
// (cero red: `setup-no-network.ts`). Cubre el camino completo — barrido
// completado, nominación de ausentes, petición `adIds`, veredicto y cola — y
// demuestra que con `DELISTED_OMISSION_CONFIRMED = false` nada se retira
// (S-LR-9), que el tope por tick y el presupuesto se respetan (S-LR-13/14) y
// que un tick con trabajo a demanda no verifica (S-LR-15).
import {
  coverageJobs,
  dailyRequestBudget,
  geographyPointWkt,
  listingPresenceChecks,
  listings,
  listingVersions,
  zones,
} from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import { DELISTED_OMISSION_CONFIRMED } from '../../src/sources/idealista/presence-evidence.js';
import type { SearchField } from '../../src/sources/idealista/search-request.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSourceWithQuota } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const RADIUS_M = 4500;
const MARGIN_M = 500;
// Dentro del círculo de 4,5 km y del mismo punto que los elementos del barrido falso.
const INSIDE = { x: -3.6, y: 37.18 };

function field(fields: readonly SearchField[], name: string): string | undefined {
  return fields.find((candidate) => candidate.name === name)?.value;
}

interface RecordingSearchPort extends IdealistaSearchPort {
  readonly sweepCalls: number;
  readonly presenceRequests: (readonly SearchField[])[];
}

// Barrido: una página de un elemento por filtro (5 peticiones, ciclo completo).
// Verificación (petición con `adIds`): delega en `presenceReply`.
function createSearchPort(presenceReply: (requestedIds: readonly string[]) => TransportOutcome): RecordingSearchPort {
  const state = { sweepCalls: 0 };
  const presenceRequests: (readonly SearchField[])[] = [];
  return {
    get sweepCalls(): number {
      return state.sweepCalls;
    },
    presenceRequests,
    search(fields: readonly SearchField[]): Promise<TransportOutcome> {
      const adIds = field(fields, 'adIds');
      if (adIds !== undefined) {
        presenceRequests.push(fields);
        return Promise.resolve(presenceReply(adIds.split(',')));
      }
      state.sweepCalls += 1;
      return Promise.resolve({
        kind: 'ok',
        status: 200,
        headers: {},
        body: {
          elementList: [
            {
              propertyCode: 900 + state.sweepCalls,
              price: 100000,
              propertyType: 'flat',
              operation: 'sale',
              url: `https://example.test/${String(state.sweepCalls)}`,
              latitude: INSIDE.y,
              longitude: INSIDE.x,
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

function reply(ids: readonly string[]): TransportOutcome {
  return {
    kind: 'ok',
    status: 200,
    headers: {},
    body: {
      elementList: ids.map((propertyCode) => ({ propertyCode })),
      totalPages: 1,
      actualPage: 1,
      itemsPerPage: 50,
    },
  };
}

const tokenPort: IdealistaTokenPort = {
  acquire(): Promise<TransportOutcome> {
    return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
  },
};

function options(overrides: Partial<CoverageWorkerOptions> = {}): CoverageWorkerOptions {
  return {
    pollIntervalMs: 1,
    maxSearchRequestsPerSweep: 10,
    dailySearchCap: 500,
    maxAttempts: 3,
    maxTicks: 1,
    refreshBudgetFraction: 0.5,
    maxVerificationRequestsPerTick: 3,
    ...overrides,
  };
}

describe('verificación de presencia de extremo a extremo con puertos falsos (S3)', () => {
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
    sourceId: string,
    searchPort: IdealistaSearchPort,
    sourceTokenPort: IdealistaTokenPort = tokenPort
  ): ReturnType<typeof createRealCoverageWorkerPorts> {
    return createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort,
      tokenPort: sourceTokenPort,
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: 500,
      refreshBudgetFraction: 0.5,
      presenceVerification: { radiusMarginM: MARGIN_M },
      blockingThresholds: { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 },
      io: { log: (): void => undefined },
    });
  }

  async function seedZone(sourceId: string, lane: 'refresh' | 'on-demand'): Promise<{ zoneId: string; jobId: string }> {
    const { zoneId } = await insertLocationWithZone(db, {
      centroid: geographyPointWkt(GRANADA),
      sweepRadiusM: RADIUS_M,
    });
    await db.update(zones).set({ state: 'covered', lastSweptAt: new Date() }).where(eq(zones.id, zoneId));
    const [job] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'sale', status: 'pending', ...(lane === 'refresh' ? { refreshRequestedAt: new Date() } : {}) })
      .returning({ id: coverageJobs.id });
    if (!job) throw new Error('fixture no insertado');
    return { zoneId, jobId: job.id };
  }

  // Un anuncio ACTIVO, dentro del círculo, no visto desde hace días.
  async function seedGhost(sourceId: string, externalId: string, rawPropertyType: string): Promise<string> {
    const [row] = await db
      .insert(listings)
      .values({
        sourceId,
        externalId,
        url: 'https://example.test/ghost',
        location: INSIDE,
        lastSeenAt: sql`now() - interval '10 days'`,
      })
      .returning({ id: listings.id });
    if (!row) throw new Error('fixture no insertado');
    await db.insert(listingVersions).values({
      listingId: row.id,
      version: 1,
      isCurrent: true,
      priceCents: 100_000,
      operation: 'sale',
      // Vocabulario de dominio (lo exige la hidratación de dedup) y crudo de la fuente (lo lee la verificación).
      propertyType: rawPropertyType === 'premise' ? 'commercial' : 'flat',
      raw: { propertyType: rawPropertyType },
    });
    return row.id;
  }

  async function statusOf(listingId: string): Promise<string | undefined> {
    const [row] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, listingId));
    return row?.status;
  }

  async function queueOf(listingId: string): Promise<{ attempts: number } | undefined> {
    const [row] = await db
      .select({ attempts: listingPresenceChecks.checkAttempts })
      .from(listingPresenceChecks)
      .where(eq(listingPresenceChecks.listingId, listingId));
    return row;
  }

  it('un barrido COMPLETADO nomina al anuncio no visto y lo verifica en el mismo tick: la petición lleva el círculo de la zona, el filtro y el id', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.sweepCalls).toBe(5);
    expect(searchPort.presenceRequests).toHaveLength(1);
    const request = searchPort.presenceRequests[0] ?? [];
    expect(field(request, 'adIds')).toBe('ghost-1');
    expect(field(request, 'propertyType')).toBe('homes');
    expect(field(request, 'operation')).toBe('sale');
    expect(field(request, 'distance')).toBe(String(RADIUS_M + MARGIN_M));
    expect(field(request, 'numPage')).toBe('1');
    expect(field(request, 'maxItems')).toBe('50');
    expect(field(request, 'center')).toBe(`${String(GRANADA.latitude)},${String(GRANADA.longitude)}`);
    // Solo el anuncio fantasma se verificó: los vistos en el barrido no se nominan.
    expect(searchPort.presenceRequests.every((fields) => field(fields, 'adIds') === 'ghost-1')).toBe(true);
    expect(await statusOf(ghostId)).toBe('active');
  });

  it('S-LR-16: un id devuelto es present: sube last_seen_at, sigue activo y sale de la cola', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(await queueOf(ghostId)).toBeUndefined();
    expect(await statusOf(ghostId)).toBe('active');
    const { rows } = await pool.query<{ fresh: boolean }>(
      `select (last_seen_at > now() - interval '1 minute') as fresh from listings where id = $1`,
      [ghostId]
    );
    expect(rows[0]?.fresh).toBe(true);
  });

  it('S-LR-9: con el valor commiteado de la constante, una omisión NO retira el anuncio (queda ambiguo, intento +1)', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort(() => reply([]));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.presenceRequests).toHaveLength(1);
    if (DELISTED_OMISSION_CONFIRMED) {
      expect(await statusOf(ghostId)).toBe('inactive');
    } else {
      expect(await statusOf(ghostId)).toBe('active');
      expect(await queueOf(ghostId)).toEqual({ attempts: 1 });
    }
  });

  it('S-LR-8: un id ajeno en la respuesta (adIds ignorado) deja el lote ambiguo y nada se retira', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort(() => reply(['otro-id']));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(await statusOf(ghostId)).toBe('active');
    expect(await queueOf(ghostId)).toEqual({ attempts: 1 });
  });

  it('S-LR-7: un error 429 de la fuente deja el anuncio activo, intento +1 y sin reintento antes de 7 días', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort(() => ({ kind: 'http-error', status: 429, bodyText: 'cuota', headers: {} }));
    const ports = buildPorts(sourceId, searchPort);

    await runCoverageWorker(ports, options({ maxTicks: 2 }));

    // El segundo tick no vuelve a pedirlo: el backoff de 7 días lo deja fuera.
    expect(searchPort.presenceRequests).toHaveLength(1);
    expect(await statusOf(ghostId)).toBe('active');
    expect(await queueOf(ghostId)).toEqual({ attempts: 1 });
  });

  it('S-LR-11: un tipo crudo sin filtro de la fuente no genera ninguna petición; el id queda ambiguo', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-chalet', 'chalet');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.presenceRequests).toHaveLength(0);
    expect(await statusOf(ghostId)).toBe('active');
    expect(await queueOf(ghostId)).toEqual({ attempts: 1 });
  });

  it('S-LR-14: con maxVerificationRequestsPerTick = 1 y dos grupos (homes y premises) sale UNA sola petición de verificación', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    await seedGhost(sourceId, 'ghost-flat', 'flat');
    await seedGhost(sourceId, 'ghost-premise', 'premise');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options({ maxVerificationRequestsPerTick: 1 }));

    expect(searchPort.presenceRequests).toHaveLength(1);
    const { rows } = await pool.query<{ total: string }>('select count(*)::text as total from listing_presence_checks');
    // El grupo no verificado sigue en la cola, vencido para el próximo tick.
    expect(rows[0]?.total).toBe('1');
  });

  it('el gasto de verificación queda en el ledger: 5 búsquedas de barrido + 1 de verificación', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    const [budget] = await db.select().from(dailyRequestBudget).where(eq(dailyRequestBudget.sourceId, sourceId));
    expect(budget?.searchRequests).toBe(6);
    // ROADMAP 3.3 (S8.3): barrido de refresco y verificación comparten el carril refresh del mes.
    const { rows } = await db.execute<{ search: number; refresh: number }>(
      sql`select search_requests as search, refresh_requests as refresh from monthly_request_budget`
    );
    expect(rows).toEqual([{ search: 6, refresh: 6 }]);
  });

  // Decisión 272: el barrido y la verificación del MISMO proceso comparten el token mientras no caduca; el
  // registro (diario y mensual) anota solo la adquisición real.
  it('barrido y verificación en el mismo tick piden y anotan UN solo token (decisión 272)', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));
    const counting = { calls: 0 };
    const expiringTokenPort: IdealistaTokenPort = {
      acquire(): Promise<TransportOutcome> {
        counting.calls += 1;
        return Promise.resolve({
          kind: 'ok',
          status: 200,
          headers: {},
          body: { access_token: `fake-token-${String(counting.calls)}`, expires_in: 43_200 },
        });
      },
    };

    await runCoverageWorker(buildPorts(sourceId, searchPort, expiringTokenPort), options());

    expect(counting.calls).toBe(1);
    const [budget] = await db.select().from(dailyRequestBudget).where(eq(dailyRequestBudget.sourceId, sourceId));
    expect(budget).toMatchObject({ searchRequests: 6, tokenRequests: 1 });
    const { rows } = await db.execute<{ search: number; token: number }>(
      sql`select search_requests as search, token_requests as token from monthly_request_budget`
    );
    expect(rows).toEqual([{ search: 6, token: 1 }]);
  });

  it('S-LR-13: si el techo del carril de refresco está agotado no sale ninguna petición de verificación y nada cambia', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));
    // Techo = floor(500 × 0.01) = 5: el barrido (5 reales) lo agota.
    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort,
      tokenPort,
      maxSearchRequestsPerSweep: 5,
      maxAttempts: 3,
      dailySearchCap: 500,
      refreshBudgetFraction: 0.01,
      presenceVerification: { radiusMarginM: MARGIN_M },
      blockingThresholds: { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 },
      io: { log: (): void => undefined },
    });

    await runCoverageWorker(ports, options({ maxSearchRequestsPerSweep: 5, refreshBudgetFraction: 0.01 }));

    expect(searchPort.sweepCalls).toBe(5);
    expect(searchPort.presenceRequests).toHaveLength(0);
    expect(await statusOf(ghostId)).toBe('active');
    expect(await queueOf(ghostId)).toEqual({ attempts: 0 });
  });

  it('S-LR-15: con un job A DEMANDA en el tick se barre y se nomina, pero la verificación espera', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'on-demand');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.sweepCalls).toBe(5);
    expect(searchPort.presenceRequests).toHaveLength(0);
    expect(await queueOf(ghostId)).toEqual({ attempts: 0 });
  });

  it('S-LR-2: un barrido INCOMPLETO (tope por barrido) no nomina a nadie', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    const ghostId = await seedGhost(sourceId, 'ghost-1', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));
    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort,
      tokenPort,
      maxSearchRequestsPerSweep: 2,
      maxAttempts: 3,
      dailySearchCap: 500,
      refreshBudgetFraction: 0.5,
      presenceVerification: { radiusMarginM: MARGIN_M },
      blockingThresholds: { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 },
      io: { log: (): void => undefined },
    });

    await runCoverageWorker(ports, options({ maxSearchRequestsPerSweep: 2 }));

    expect(searchPort.sweepCalls).toBe(2);
    expect(await queueOf(ghostId)).toBeUndefined();
    expect(searchPort.presenceRequests).toHaveLength(0);
  });

  it('un anuncio visto DURANTE el barrido nunca se nomina aunque exista en la base de datos', async () => {
    const sourceId = await insertSourceWithQuota(db);
    await seedZone(sourceId, 'refresh');
    // Mismo external_id que el primer elemento del barrido falso (901).
    const seenId = await seedGhost(sourceId, '901', 'flat');
    const searchPort = createSearchPort((ids) => reply(ids));

    await runCoverageWorker(buildPorts(sourceId, searchPort), options());

    expect(searchPort.presenceRequests).toHaveLength(0);
    expect(await queueOf(seenId)).toBeUndefined();
  });
});

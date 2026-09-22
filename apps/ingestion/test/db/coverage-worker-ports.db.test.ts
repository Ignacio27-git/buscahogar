// ROADMAP 1.13 Unit C (diseño CR-2, DD-17, DD-18) — `createRealCoverageWorkerPorts`
// contra PostgreSQL real, con `IdealistaSearchPort`/`IdealistaTokenPort`
// FALSOS (mismo patrón que idealista-source-cap.test.ts, 1.6): la única
// forma de probar la reutilización REAL de `createIdealistaSource` +
// `runSweep` + `composeStore` (CR-2) sin tocar la red — `setup-no-network.ts`
// (fase 1) hace que `fetch` lance para todo el conjunto de tests, y
// `runSweepZone` no admite puertos inyectados, así que "equivalente al CLI
// de un solo barrido" se demuestra ESTRUCTURALMENTE: este fichero invoca el
// MISMO `runSweep`/`composeStore` (importados sin cambios) que
// scripts/sweep-zone.ts, nunca una reescritura — la equivalencia de salida
// es una propiedad del código compartido, no algo que se pueda re-derivar
// ejecutando ambos caminos en el mismo test sin abrir una conexión HTTP real
// (prohibida aquí).
//
// Sin describeWithDb (D2): DATABASE_URL ya está garantizada por el
// setupFile de esta config, mismo patrón que coverage-store.db.test.ts y
// job-selection.db.test.ts.
import { coverageJobs, dedupRuns, geographyPointWkt, listings, listingVersions, propertyListings, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AreaQuery } from '@buscahogar/core';

import { JobAlreadyClaimedError } from '../../src/sweep/coverage-store.js';
import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };

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

// Cada página declara SIEMPRE menos elementos que itemsPerPage: el filtro
// se agota tras UNA sola página (sweep-planner.ts::planNext, condición 5),
// así que un barrido completo emite exactamente 5 peticiones de búsqueda —
// una por cada IDEALISTA_FILTERS — y una de token, determinista.
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
        body: {
          elementList: [fakeElement(state.calls)],
          totalPages: 1,
          actualPage: 1,
          itemsPerPage: 50,
          total: 1,
        },
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

const BLOCKING_THRESHOLDS = { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 };

describe('createRealCoverageWorkerPorts — CR-2: reutiliza runSweep/composeStore/createIdealistaSource sin red', () => {
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

  it('REPRO-1a / R-TEST: fetch lanza y no hay credenciales de Idealista — la suite sigue sin red real', () => {
    expect(() => globalThis.fetch('https://api.idealista.com/oauth/token')).toThrow(/red deshabilitada/);
    expect(process.env['IDEALISTA_API_KEY']).toBeUndefined();
    expect(process.env['IDEALISTA_API_SECRET']).toBeUndefined();
  });

  it('A-8: un trabajo pending sin --zone de CLI se reclama y se barre hasta completarse, vía el puerto real', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSource(db);
    const [jobRow] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, status: 'pending' })
      .returning({ id: coverageJobs.id });
    if (!jobRow) throw new Error('fixture no insertado');

    const searchPort = createExhaustingSearchPort();
    const logged: string[] = [];
    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort,
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: 500,
      blockingThresholds: BLOCKING_THRESHOLDS,
      io: { log: (line) => logged.push(line) },
    });
    const options: CoverageWorkerOptions = {
      operation: 'sale',
      pollIntervalMs: 1,
      maxSearchRequestsPerSweep: 10,
      dailySearchCap: 500,
      maxAttempts: 3,
      maxTicks: 1,
    };

    await runCoverageWorker(ports, options);

    // Cinco filtros (IDEALISTA_FILTERS), un elemento por filtro — el mismo
    // driver runSweep/createIdealistaSource que scripts/sweep-zone.ts.
    expect(searchPort.calls).toBe(5);

    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobRow.id));
    expect(job?.status).toBe('done');

    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('covered');

    const insertedListings = await db.select().from(listings);
    expect(insertedListings).toHaveLength(5);

    // El informe de barrido (R2) se registró antes de terminar, igual que
    // scripts/sweep-zone.ts.
    expect(logged.some((line) => line.includes('"requestsSpent"'))).toBe(true);
  });

  it('A-8.1: un trabajo ya reclamado por otro proceso lanza JobAlreadyClaimedError REAL (coverage-store.ts CAS)', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSource(db);
    // Simula un proceso concurrente que ya tiene este trabajo.
    await db.insert(coverageJobs).values({ zoneId, sourceId, status: 'running' });

    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort: createExhaustingSearchPort(),
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: 500,
      blockingThresholds: BLOCKING_THRESHOLDS,
      io: { log: (): void => undefined },
    });

    const area: AreaQuery = { center: GRANADA, radiusMeters: 4500, operation: 'sale' };
    await expect(ports.claimAndSweep({ jobId: 'ignored', zoneId, sourceId }, area, 'fp-1')).rejects.toThrow(
      JobAlreadyClaimedError
    );
  });

  it('DD-10/CR-2: runDedup reutiliza el reproceso GLOBAL — agrupa un listing PREEXISTENTE fuera de este trabajo, sin filtro de zona', async () => {
    const sourceId = await insertSource(db);
    // Dos anuncios YA en el corpus antes de esta llamada, simulando que
    // pertenecen a un barrido anterior/otra zona — ninguno lo insertó
    // claimAndSweep en este tick. blocking.ts:4-6 no filtra por zona ni por
    // barrido de origen (decisión 068), así que runDedup debe agruparlos
    // igual que reprocess-dedup.ts lo haría.
    const [listingA] = await db
      .insert(listings)
      .values({ sourceId, externalId: 'ext-a', url: 'https://example.test/a', location: { x: -3.598557, y: 37.177336 } })
      .returning({ id: listings.id });
    const [listingB] = await db
      .insert(listings)
      .values({ sourceId, externalId: 'ext-b', url: 'https://example.test/b', location: { x: -3.5986, y: 37.1774 } })
      .returning({ id: listings.id });
    if (!listingA || !listingB) throw new Error('fixtures no insertados');

    await db.insert(listingVersions).values([
      { listingId: listingA.id, version: 1, isCurrent: true, priceCents: 20000000, operation: 'sale', propertyType: 'flat', surfaceM2: 80 },
      { listingId: listingB.id, version: 1, isCurrent: true, priceCents: 20000000, operation: 'sale', propertyType: 'flat', surfaceM2: 82 },
    ]);

    const logged: string[] = [];
    const ports = createRealCoverageWorkerPorts({
      db,
      sourceUuid: sourceId,
      searchPort: createExhaustingSearchPort(),
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: 10,
      maxAttempts: 3,
      dailySearchCap: 500,
      blockingThresholds: BLOCKING_THRESHOLDS,
      io: { log: (line) => logged.push(line) },
    });

    await ports.runDedup();

    const runs = await db.select().from(dedupRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.listingsConsidered).toBe(2);
    expect(runs[0]?.candidatePairs).toBe(1);

    const linksA = await db.select().from(propertyListings).where(eq(propertyListings.listingId, listingA.id));
    const linksB = await db.select().from(propertyListings).where(eq(propertyListings.listingId, listingB.id));
    expect(linksA[0]?.propertyId).toBe(linksB[0]?.propertyId);
  });
});

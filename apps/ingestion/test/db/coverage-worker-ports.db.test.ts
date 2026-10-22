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
import {
  coverageJobs,
  dedupRuns,
  geographyPointWkt,
  listings,
  listingVersions,
  propertyListings,
  reserveDailyBudget,
  zones,
} from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AreaQuery } from '@buscahogar/core';

import { JobAlreadyClaimedError } from '../../src/sweep/coverage-store.js';
import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSourceWithQuota } from './helpers/seed-fixtures.js';

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
    const sourceId = await insertSourceWithQuota(db);
    const [jobRow] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'sale', status: 'pending' })
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

  // ROADMAP 3.3 (decisión 252; S12.1) — de extremo a extremo con los puertos REALES: un
  // único worker, sin operación por proceso, barre el job de sale y el de rent de la
  // misma zona; cada barrido usa la operación de SU job y deja SU cobertura.
  it('S12.1: un único worker barre el job de sale y el de rent de la misma zona, cada uno con su operación y su cobertura', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values([
      // Fechas recientes: el mantenimiento del tick purgaría una zona sin demanda desde hace >= 180 días.
      { zoneId, sourceId, operation: 'sale', status: 'pending', requestedAt: new Date(Date.now() - 2_000) },
      { zoneId, sourceId, operation: 'rent', status: 'pending', requestedAt: new Date(Date.now() - 1_000) },
    ]);
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

    await runCoverageWorker(ports, {
      pollIntervalMs: 1,
      maxSearchRequestsPerSweep: 10,
      dailySearchCap: 500,
      maxAttempts: 3,
      maxTicks: 2,
    });

    // Dos barridos completos de 5 peticiones cada uno.
    expect(searchPort.calls).toBe(10);
    const areas = logged.filter((line) => line.startsWith('coverage-worker: área a barrer'));
    expect(areas).toHaveLength(2);
    expect(areas[0]).toContain('"operation":"sale"');
    expect(areas[1]).toContain('"operation":"rent"');
    const jobs = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(jobs.map((job) => [job.operation, job.status, job.lastCompletedAt instanceof Date]).sort()).toEqual([
      ['rent', 'done', true],
      ['sale', 'done', true],
    ]);
  });

  it('A-8.1: un trabajo ya reclamado por otro proceso lanza JobAlreadyClaimedError REAL (coverage-store.ts CAS)', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    // Simula un proceso concurrente que ya tiene este trabajo.
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'running' });

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
    await expect(ports.claimAndSweep({ jobId: 'ignored', zoneId, sourceId, operation: 'sale' }, area, 'fp-1')).rejects.toThrow(
      JobAlreadyClaimedError
    );
  });

  it('DD-10/CR-2: runDedup reutiliza el reproceso GLOBAL — agrupa un listing PREEXISTENTE fuera de este trabajo, sin filtro de zona', async () => {
    const sourceId = await insertSourceWithQuota(db);
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

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, S-ZRS-9..13) — los
// puertos REALES del carril de refresco contra PostgreSQL real, con la fuente
// falsa: techo por carril sobre el gasto total, mantenimiento (señales +
// re-encolado) y cortes de bucle. Ninguna llamada de red.

// Cada página trae itemsPerPage elementos y `totalPages` enorme: el filtro
// NUNCA se agota solo, así que solo el tope por barrido (o el presupuesto)
// puede detener el bucle.
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
          elementList: [fakeElement(state.calls * 2), fakeElement(state.calls * 2 + 1)],
          totalPages: 999,
          actualPage: state.calls,
          itemsPerPage: 2,
          total: 1998,
        },
      });
    },
  };
}

function refreshOptions(overrides: Partial<CoverageWorkerOptions> = {}): CoverageWorkerOptions {
  return {
    pollIntervalMs: 1,
    maxSearchRequestsPerSweep: 10,
    dailySearchCap: 500,
    maxAttempts: 3,
    maxTicks: 1,
    refreshBudgetFraction: 0.2,
    ...overrides,
  };
}

describe('createRealCoverageWorkerPorts — carril de refresco (ROADMAP 2.5, S1)', () => {
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
    overrides: {
      readonly searchPort?: IdealistaSearchPort;
      readonly dailySearchCap?: number;
      readonly maxSearchRequestsPerSweep?: number;
      readonly refreshBudgetFraction?: number;
    } = {}
  ): ReturnType<typeof createRealCoverageWorkerPorts> {
    return createRealCoverageWorkerPorts({
      db,
      sourceUuid,
      searchPort: overrides.searchPort ?? createExhaustingSearchPort(),
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: overrides.maxSearchRequestsPerSweep ?? 10,
      maxAttempts: 3,
      dailySearchCap: overrides.dailySearchCap ?? 500,
      ...(overrides.refreshBudgetFraction !== undefined ? { refreshBudgetFraction: overrides.refreshBudgetFraction } : {}),
      blockingThresholds: BLOCKING_THRESHOLDS,
      io: { log: (): void => undefined },
    });
  }

  async function seedCoveredZoneWithDoneJob(
    sourceId: string,
    sweptDaysAgo: number
  ): Promise<{ readonly zoneId: string; readonly jobId: string }> {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    await db
      .update(zones)
      .set({ state: 'covered', lastSweptAt: sql`now() - (${sweptDaysAgo}::integer * interval '1 day')` })
      .where(eq(zones.id, zoneId));
    const [job] = await db
      .insert(coverageJobs)
      .values({
        zoneId,
        sourceId,
        operation: 'sale',
        status: 'done',
        // Cobertura de (zona, operación) desde decisión 250: el último barrido es el del job.
        lastCompletedAt: sql`now() - (${sweptDaysAgo}::integer * interval '1 day')`,
      })
      .returning({ id: coverageJobs.id });
    if (!job) throw new Error('fixture no insertado');
    await db.execute(sql`insert into zone_query_signals (zone_id) values (${zoneId})`);
    return { zoneId, jobId: job.id };
  }

  it('S-ZRS-9: reserveBudget("refresh") aplica el techo floor(cap × fracción) sobre el gasto TOTAL; "on-demand" no tiene techo', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const ports = buildPorts(sourceId, { dailySearchCap: 100, refreshBudgetFraction: 0.2 });
    const reservation = { searchReserved: 10, tokenReserved: 1 };

    expect(await ports.reserveBudget(reservation, 'refresh')).not.toBeNull(); // 10 <= 20
    expect(await ports.reserveBudget(reservation, 'refresh')).not.toBeNull(); // 20 <= 20
    expect(await ports.reserveBudget(reservation, 'refresh')).toBeNull(); // 30 > 20
    expect(await ports.reserveBudget(reservation, 'on-demand')).not.toBeNull(); // 30 <= 100
  });

  it('S-ZRS-10: sin fracción (o 0) ninguna reserva de refresco se concede, y la demanda sigue reservando', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const ports = buildPorts(sourceId, { dailySearchCap: 100 });
    const reservation = { searchReserved: 1, tokenReserved: 0 };

    expect(await ports.reserveBudget(reservation, 'refresh')).toBeNull();
    expect(await ports.reserveBudget(reservation, 'on-demand')).not.toBeNull();
  });

  it('S-ZRS-12: con 95 de 100 gastados a demanda y fracción 0.2, un job de refresco pendiente NO se barre (cero peticiones) y sigue pendiente', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'pending', refreshRequestedAt: new Date() });
    await reserveDailyBudget(db, sourceId, { searchReserved: 95, tokenReserved: 0 }, 100);
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, dailySearchCap: 100, refreshBudgetFraction: 0.2 });

    await runCoverageWorker(ports, refreshOptions({ dailySearchCap: 100 }));

    expect(searchPort.calls).toBe(0);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(job?.status).toBe('pending');
    expect(job?.attempts).toBe(0);
  });

  it('S-ZRS-13: un job de refresco con una fuente que NUNCA se agota se corta en el tope por barrido — el ciclo queda incompleto y en el carril de refresco', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'pending', refreshRequestedAt: new Date() });
    const searchPort = createNeverExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, maxSearchRequestsPerSweep: 3, refreshBudgetFraction: 1 });

    await runCoverageWorker(ports, refreshOptions({ maxSearchRequestsPerSweep: 3, refreshBudgetFraction: 1 }));

    expect(searchPort.calls).toBe(3);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(job?.status).toBe('pending');
    expect(job?.cursor).not.toBeNull();
    expect(job?.refreshRequestedAt).not.toBeNull();
    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.lastSweptAt).toBeNull();
  });

  it('maintenance.purgeZoneQuerySignals borra las señales de más de 180 días y conserva las recientes', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSourceWithQuota(db);
    await db.execute(sql`
      insert into zone_query_signals (zone_id, day) values
        (${zoneId}, (now() at time zone 'utc')::date - 200),
        (${zoneId}, (now() at time zone 'utc')::date - 5)
    `);
    const ports = buildPorts(sourceId);

    const deleted = await ports.maintenance?.purgeZoneQuerySignals();

    expect(deleted).toBe(1);
    const { rows } = await pool.query<{ count: string }>('select count(*)::text as count from zone_query_signals');
    expect(rows[0]?.count).toBe('1');
  });

  it('un tick completo: zona covered vencida (barrida hace 8 días, señal de hoy) se re-encola, se barre en el MISMO tick y vuelve a estado "a demanda"', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const { zoneId, jobId } = await seedCoveredZoneWithDoneJob(sourceId, 8);
    const [before] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, refreshBudgetFraction: 0.2 });

    await runCoverageWorker(ports, refreshOptions());

    expect(searchPort.calls).toBe(5);
    const [after] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    expect(after?.status).toBe('done');
    expect(after?.refreshRequestedAt).toBeNull();
    expect(after?.requestedAt.getTime()).toBe(before?.requestedAt.getTime());
    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('covered');
  });

  it('el mismo tick con fracción 0: la zona vencida NO se re-encola y no hay ninguna petición a la fuente', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const { jobId } = await seedCoveredZoneWithDoneJob(sourceId, 8);
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, refreshBudgetFraction: 0 });

    await runCoverageWorker(ports, refreshOptions({ refreshBudgetFraction: 0 }));

    expect(searchPort.calls).toBe(0);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    expect(job?.status).toBe('done');
  });

  it('una zona covered NO vencida (barrida hace 2 días) no se re-encola: cero peticiones', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const { jobId } = await seedCoveredZoneWithDoneJob(sourceId, 2);
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, refreshBudgetFraction: 0.2 });

    await runCoverageWorker(ports, refreshOptions());

    expect(searchPort.calls).toBe(0);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, jobId));
    expect(job?.status).toBe('done');
  });

  // ROADMAP 2.5 (S4; decisiones 107 y 108) — los dos planos de purga con los
  // puertos REALES: purga de zonas (reinicio) y tombstone de anuncios.
  async function seedPurgeableZone(sourceId: string): Promise<{ readonly zoneId: string; readonly jobId: string }> {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    await db.update(zones).set({ state: 'covered', lastSweptAt: sql`now() - interval '300 days'` }).where(eq(zones.id, zoneId));
    const jobId = await pool
      .query<{ id: string }>(
        `insert into coverage_jobs (zone_id, source_id, operation, status, requested_at)
         values ($1, $2, 'sale', 'done', now() - interval '200 days') returning id`,
        [zoneId, sourceId]
      )
      .then((result) => result.rows[0]?.id);
    if (!jobId) throw new Error('fixture no insertado');
    return { zoneId, jobId };
  }

  async function seedListingAt(sourceId: string, externalId: string, location: { x: number; y: number }): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into listings (source_id, external_id, url, location, thumbnail_url)
       values ($1, $2, 'https://example.test/x', ST_SetSRID(ST_MakePoint($3, $4), 4326), 'https://cdn.example.test/x.jpg') returning id`,
      [sourceId, externalId, location.x, location.y]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('fixture no insertado');
    return id;
  }

  it('maintenance.purgeZones reinicia la zona (job y señales fuera, zona uncovered) y retira sus anuncios huérfanos', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const { zoneId } = await seedPurgeableZone(sourceId);
    const listingId = await seedListingAt(sourceId, 'in-zone', { x: GRANADA.longitude, y: GRANADA.latitude });
    const ports = buildPorts(sourceId);

    const purged = await ports.maintenance?.purgeZones([zoneId]);

    expect(purged).toBe(1);
    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('uncovered');
    expect(zone?.lastSweptAt).toBeNull();
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    expect(listing?.status).toBe('inactive');
    expect(listing?.inactiveReason).toBe('zone_purged');
  });

  it('maintenance.tombstoneExpiredListings redacta los inactivos de >= 180 días y devuelve cuántos', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const listingId = await seedListingAt(sourceId, 'old-inactive', { x: GRANADA.longitude, y: GRANADA.latitude });
    await pool.query(
      `update listings set status = 'inactive', inactive_reason = 'delisted', inactive_since = now() - interval '181 days' where id = $1`,
      [listingId]
    );
    const ports = buildPorts(sourceId);

    const tombstoned = await ports.maintenance?.tombstoneExpiredListings();

    expect(tombstoned).toBe(1);
    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    expect(listing?.status).toBe('removed');
    expect(listing?.thumbnailUrl).toBeNull();
    expect(listing?.tombstonedAt).toBeInstanceOf(Date);
  });

  it('un tick completo: zona sin consultas desde hace 200 días se purga SIN ninguna petición a la fuente y no se refresca', async () => {
    const sourceId = await insertSourceWithQuota(db);
    const { zoneId } = await seedPurgeableZone(sourceId);
    const searchPort = createExhaustingSearchPort();
    const ports = buildPorts(sourceId, { searchPort, refreshBudgetFraction: 0.2 });

    await runCoverageWorker(ports, refreshOptions());

    expect(searchPort.calls).toBe(0);
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zone?.state).toBe('uncovered');
  });
});

// ROADMAP 3.4 (decisión 258, D14; R6.2) — parada ordenada con los puertos REALES: con una parada pedida a mitad
// del barrido, `runSweep` cierra en el LÍMITE DE PÁGINA con el desenlace `budget-exhausted` ya existente (job a
// `pending` con el cursor confirmado, presupuesto reconciliado con lo gastado) y el siguiente arranque reanuda
// desde ese cursor sin repetir la página ya pagada.
describe('createRealCoverageWorkerPorts — parada ordenada en el límite de página (ROADMAP 3.4, decisión 258)', () => {
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
    shouldStop?: () => boolean
  ): ReturnType<typeof createRealCoverageWorkerPorts> {
    return createRealCoverageWorkerPorts({
      db,
      sourceUuid,
      searchPort,
      tokenPort: createFakeTokenPort(),
      maxSearchRequestsPerSweep: 4,
      maxAttempts: 3,
      dailySearchCap: 500,
      blockingThresholds: BLOCKING_THRESHOLDS,
      ...(shouldStop ? { shouldStop } : {}),
      io: { log: (): void => undefined },
    });
  }

  const OPTIONS: CoverageWorkerOptions = {
    pollIntervalMs: 1,
    maxSearchRequestsPerSweep: 4,
    dailySearchCap: 500,
    maxAttempts: 3,
    maxTicks: 1,
  };

  async function dailySpent(): Promise<number> {
    const { rows } = await db.execute<{ total: number }>(
      sql`select coalesce(sum(search_requests), 0)::integer as total from daily_request_budget`
    );
    return rows[0]?.total ?? 0;
  }

  it('la parada pedida durante la primera página cierra el barrido tras ella: job pending con cursor, una sola petición reconciliada', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'pending' });
    const inner = createNeverExhaustingSearchPort();
    let stop = false;
    const searchPort: IdealistaSearchPort = {
      search(...args): Promise<TransportOutcome> {
        // La señal llega mientras se pide la primera página.
        stop = true;
        return inner.search(...args);
      },
    };

    await runCoverageWorker(buildPorts(sourceId, searchPort, () => stop), {
      ...OPTIONS,
      shouldContinue: () => !stop,
      shouldStop: () => stop,
    });

    expect(inner.calls).toBe(1);
    const [job] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(job?.status).toBe('pending');
    expect(job?.cursor).not.toBeNull();
    expect(job?.attempts).toBe(1);
    expect(job?.finishedAt).toBeNull();
    // La primera página quedó persistida (2 anuncios), con su cursor en la misma transacción.
    expect(await db.select().from(listings)).toHaveLength(2);
    // El presupuesto se reconcilió con lo gastado (1 petición), no con las 4 reservadas.
    expect(await dailySpent()).toBe(1);
  });

  it('el siguiente arranque reanuda desde ese cursor: no repite la primera página y termina el barrido hasta su tope', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'pending' });
    let stop = false;
    const first = createNeverExhaustingSearchPort();
    await runCoverageWorker(
      buildPorts(
        sourceId,
        {
          search(...args): Promise<TransportOutcome> {
            stop = true;
            return first.search(...args);
          },
        },
        () => stop
      ),
      { ...OPTIONS, shouldContinue: () => !stop, shouldStop: () => stop }
    );
    const [paused] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    const cursorBefore = paused?.cursor;

    const second = createNeverExhaustingSearchPort();
    await runCoverageWorker(buildPorts(sourceId, second), OPTIONS);

    expect(cursorBefore).not.toBeNull();
    expect(second.calls).toBe(4);
    const [resumed] = await db.select().from(coverageJobs).where(eq(coverageJobs.zoneId, zoneId));
    expect(resumed?.cursor).not.toBe(cursorBefore);
    expect(resumed?.attempts).toBe(2);
  });

  it('sin parada pedida, el mismo barrido llega a su tope por barrido (control: shouldStop no altera el flujo normal)', async () => {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const sourceId = await insertSourceWithQuota(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'pending' });
    const searchPort = createNeverExhaustingSearchPort();

    await runCoverageWorker(buildPorts(sourceId, searchPort, () => false), { ...OPTIONS, shouldStop: () => false });

    expect(searchPort.calls).toBe(4);
  });
});

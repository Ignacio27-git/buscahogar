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
    const [row] = await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'pending' }).returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);
    // ROADMAP 2.5 (S1): el job lleva ahora su carril; sin `refresh_requested_at`
    // es a demanda.
    expect(job).toEqual({ jobId: row?.id, zoneId, sourceId, operation: 'rent', lane: 'on-demand' });
  });

  // ROADMAP 3.3 (decisión 252; S12.1): el job seleccionado lleva SU operación, la que
  // usará el worker único para la búsqueda y el área.
  it('el job seleccionado lleva la operación de su fila (sale o rent), y los dos de una zona son candidatos independientes', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [sale] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'sale', status: 'pending', requestedAt: new Date('2026-01-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });
    await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'rent', status: 'pending', requestedAt: new Date('2026-02-01T00:00:00Z') });

    const first = await selectNextClaimableJob(db, 3);
    expect(first).toMatchObject({ jobId: sale?.id, operation: 'sale' });

    await db.update(coverageJobs).set({ status: 'running' }).where(eq(coverageJobs.id, sale?.id ?? ''));
    const second = await selectNextClaimableJob(db, 3);
    expect(second).toMatchObject({ operation: 'rent' });
    expect(second?.jobId).not.toBe(sale?.id);
  });

  it('un trabajo failed con reintentos restantes (attempts < maxAttempts) es seleccionable', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    const [row] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'rent', status: 'failed', attempts: 1 })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);
    expect(job?.jobId).toBe(row?.id);
  });

  it('un trabajo failed SIN reintentos restantes (attempts >= maxAttempts) NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'failed', attempts: 3 });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('un trabajo running NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'running' });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('un trabajo done NUNCA se selecciona', async () => {
    const { zoneId } = await insertLocationWithZone(db);
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'done' });

    const job = await selectNextClaimableJob(db, 3);
    expect(job).toBeNull();
  });

  it('con varios trabajos seleccionables, elige el más antiguo por requested_at', async () => {
    const { zoneId: zoneIdA } = await insertLocationWithZone(db, { ineCode: '10001' });
    const { zoneId: zoneIdB } = await insertLocationWithZone(db, { ineCode: '10002' });
    const sourceId = await insertSource(db);

    const [older] = await db
      .insert(coverageJobs)
      .values({ zoneId: zoneIdA, sourceId, operation: 'rent', status: 'pending', requestedAt: new Date('2026-01-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });
    await db
      .insert(coverageJobs)
      .values({ zoneId: zoneIdB, sourceId, operation: 'rent', status: 'pending', requestedAt: new Date('2026-06-01T00:00:00Z') });

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
      operation: 'rent',
      status: 'pending',
      requestedAt: new Date('2026-01-01T00:00:00Z'),
      refreshRequestedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const [demand] = await db
      .insert(coverageJobs)
      .values({ zoneId: demandZone, sourceId, operation: 'rent', status: 'pending', requestedAt: new Date('2026-06-01T00:00:00Z') })
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
      .values({ zoneId, sourceId, operation: 'rent', status: 'pending', refreshRequestedAt: new Date('2026-09-01T00:00:00Z') })
      .returning({ id: coverageJobs.id });

    const job = await selectNextClaimableJob(db, 3);

    expect(job).toEqual({ jobId: refresh?.id, zoneId, sourceId, operation: 'rent', lane: 'refresh' });
  });

  it('entre dos jobs de refresco, el orden sigue siendo por requested_at (el más antiguo primero)', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '10021' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '10022' });
    const sourceId = await insertSource(db);
    await db.insert(coverageJobs).values({
      zoneId: zoneB,
      sourceId,
      operation: 'rent',
      status: 'pending',
      requestedAt: new Date('2026-06-01T00:00:00Z'),
      refreshRequestedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const [older] = await db
      .insert(coverageJobs)
      .values({
        zoneId: zoneA,
        sourceId,
        operation: 'rent',
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
    const [row] = await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'rent', status: 'pending' }).returning({ id: coverageJobs.id });
    if (!row) throw new Error('fixture no insertado');

    await markJobFailedWithoutClaim(db, row.id, 'zona sin centroide (DD-5)');

    const [after] = await db.select().from(coverageJobs).where(eq(coverageJobs.id, row.id));
    expect(after?.status).toBe('failed');
    expect(after?.error).toBe('zona sin centroide (DD-5)');
    expect(after?.attempts).toBe(0);
    expect(after?.finishedAt).not.toBeNull();
  });
});

// ROADMAP 3.3 (decisión 251; R13, S13.1-S13.5) — prioridad por demanda SOLO en el carril a demanda:
// días con señal en la ventana de 30 días UTC [hoy-29, hoy] DESC, después `requested_at` y `id`. Las
// señales se siembran con edades en días respecto al día UTC de Postgres (el mismo reloj que usa la consulta).
describe('job-selection — prioridad por días con señal (decisión 251, R13)', () => {
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

  async function seedSignals(zoneId: string, agesInDays: readonly number[]): Promise<void> {
    await pool.query(
      "insert into zone_query_signals (zone_id, day) select $1, (now() at time zone 'utc')::date - age from unnest($2::int[]) as age",
      [zoneId, [...agesInDays]]
    );
  }

  async function pendingJob(
    zoneId: string,
    sourceId: string,
    requestedAt: string,
    extra: { readonly refresh?: boolean; readonly operation?: 'sale' | 'rent' } = {}
  ): Promise<string> {
    const [row] = await db
      .insert(coverageJobs)
      .values({
        zoneId,
        sourceId,
        operation: extra.operation ?? 'rent',
        status: 'pending',
        requestedAt: new Date(requestedAt),
        ...(extra.refresh === true ? { refreshRequestedAt: new Date('2026-09-01T00:00:00Z') } : {}),
      })
      .returning({ id: coverageJobs.id });
    if (!row) throw new Error('fixture no insertado');
    return row.id;
  }

  it('S13.1: entre dos jobs a demanda gana el de más días con señal, aunque sea el más reciente', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '11001' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '11002' });
    const sourceId = await insertSource(db);
    await pendingJob(zoneA, sourceId, '2026-01-01T00:00:00Z');
    const busier = await pendingJob(zoneB, sourceId, '2026-06-01T00:00:00Z');
    await seedSignals(zoneA, [0, 1, 2]);
    await seedSignals(zoneB, [0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const job = await selectNextClaimableJob(db, 3);

    expect(job?.jobId).toBe(busier);
    expect(job?.lane).toBe('on-demand');
  });

  it('S13.2: con los mismos días con señal gana el requested_at más antiguo', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '11011' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '11012' });
    const sourceId = await insertSource(db);
    await pendingJob(zoneB, sourceId, '2026-06-01T00:00:00Z');
    const older = await pendingJob(zoneA, sourceId, '2026-01-01T00:00:00Z');
    await seedSignals(zoneA, [0, 1]);
    await seedSignals(zoneB, [2, 3]);

    expect((await selectNextClaimableJob(db, 3))?.jobId).toBe(older);
  });

  it('con requested_at igual y los mismos días con señal, el desempate es el id (determinista)', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '11021' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '11022' });
    const sourceId = await insertSource(db);
    const idA = await pendingJob(zoneA, sourceId, '2026-03-01T00:00:00Z');
    const idB = await pendingJob(zoneB, sourceId, '2026-03-01T00:00:00Z');

    const expected = [idA, idB].sort()[0];
    expect((await selectNextClaimableJob(db, 3))?.jobId).toBe(expected);
  });

  it('S13.3: las señales fuera de la ventana no cuentan; el día 30 de la ventana (hoy-29) sí y el 31 (hoy-30) no', async () => {
    const { zoneId: inside } = await insertLocationWithZone(db, { ineCode: '11031' });
    const { zoneId: outside } = await insertLocationWithZone(db, { ineCode: '11032' });
    const sourceId = await insertSource(db);
    // `outside` es más antiguo y tiene MUCHAS señales, pero todas fuera de la ventana: cuenta 0.
    await pendingJob(outside, sourceId, '2026-01-01T00:00:00Z');
    const withBoundary = await pendingJob(inside, sourceId, '2026-06-01T00:00:00Z');
    await seedSignals(outside, [30, 31, 40, 90, 120]);
    await seedSignals(inside, [29]);

    expect((await selectNextClaimableJob(db, 3))?.jobId).toBe(withBoundary);
  });

  it('S13.3: sin ninguna señal dentro de la ventana el orden vuelve a ser requested_at', async () => {
    const { zoneId: zoneA } = await insertLocationWithZone(db, { ineCode: '11041' });
    const { zoneId: zoneB } = await insertLocationWithZone(db, { ineCode: '11042' });
    const sourceId = await insertSource(db);
    const older = await pendingJob(zoneA, sourceId, '2026-01-01T00:00:00Z');
    await pendingJob(zoneB, sourceId, '2026-06-01T00:00:00Z');
    await seedSignals(zoneB, [30, 45]);

    expect((await selectNextClaimableJob(db, 3))?.jobId).toBe(older);
  });

  it('S13.4: un job a demanda sin señales va antes que un job de refresco con muchas señales', async () => {
    const { zoneId: refreshZone } = await insertLocationWithZone(db, { ineCode: '11051' });
    const { zoneId: demandZone } = await insertLocationWithZone(db, { ineCode: '11052' });
    const sourceId = await insertSource(db);
    await pendingJob(refreshZone, sourceId, '2026-01-01T00:00:00Z', { refresh: true });
    const demand = await pendingJob(demandZone, sourceId, '2026-06-01T00:00:00Z');
    await seedSignals(refreshZone, Array.from({ length: 20 }, (_, age) => age));

    const job = await selectNextClaimableJob(db, 3);

    expect(job?.jobId).toBe(demand);
    expect(job?.lane).toBe('on-demand');
  });

  it('S13.5: entre jobs de refresco manda requested_at, no las señales', async () => {
    const { zoneId: zoneX } = await insertLocationWithZone(db, { ineCode: '11061' });
    const { zoneId: zoneY } = await insertLocationWithZone(db, { ineCode: '11062' });
    const sourceId = await insertSource(db);
    const older = await pendingJob(zoneX, sourceId, '2026-01-01T00:00:00Z', { refresh: true });
    await pendingJob(zoneY, sourceId, '2026-06-01T00:00:00Z', { refresh: true });
    await seedSignals(zoneY, Array.from({ length: 20 }, (_, age) => age));

    const job = await selectNextClaimableJob(db, 3);

    expect(job?.jobId).toBe(older);
    expect(job?.lane).toBe('refresh');
  });

  it('las señales son de la ZONA: los jobs de venta y alquiler de una zona con demanda superan a los de una zona sin ella', async () => {
    const { zoneId: busy } = await insertLocationWithZone(db, { ineCode: '11071' });
    const { zoneId: quiet } = await insertLocationWithZone(db, { ineCode: '11072' });
    const sourceId = await insertSource(db);
    await pendingJob(quiet, sourceId, '2026-01-01T00:00:00Z');
    const busySale = await pendingJob(busy, sourceId, '2026-06-01T00:00:00Z', { operation: 'sale' });
    await seedSignals(busy, [0, 1]);

    const first = await selectNextClaimableJob(db, 3);
    expect(first).toMatchObject({ jobId: busySale, operation: 'sale' });
  });
});

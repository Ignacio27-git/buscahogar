// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103/104) — capa SQL del
// planificador de refresco: `listZoneLifecycle` entrega a `packages/core` las
// fotos de zona (días desde la última demanda y segundos desde el último
// barrido, ambos con el reloj de Postgres) y `scheduleRefresh` re-encola los
// jobs vencidos sin tocar `requested_at`. Contra PostgreSQL real.
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { listZoneLifecycle, scheduleRefresh } from '../../src/zone-lifecycle.js';
import { zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertLocation, insertSource } from '../helpers/fixtures.js';

const MAX_ATTEMPTS = 3;
const DAY_SECONDS = 86_400;

async function insertZone(db: Database, overrides: Partial<typeof zones.$inferInsert> = {}): Promise<string> {
  const locationId = await insertLocation(db);
  const [zone] = await db
    .insert(zones)
    .values({ locationId, ...overrides })
    .returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

interface JobSeed {
  readonly status: string;
  readonly operation?: 'sale' | 'rent';
  // La operación está cubierta: `last_completed_at` fijado (decisión 250).
  readonly completed?: boolean;
  readonly attempts?: number;
  readonly requestedDaysAgo?: number;
  readonly error?: string | null;
}

async function insertJob(pool: Pool, zoneId: string, sourceId: string, seed: JobSeed): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into coverage_jobs (zone_id, source_id, operation, status, attempts, error, requested_at, last_completed_at)
     values ($1, $2, $3, $4, $5, $6, now() - ($7::integer * interval '1 day'), case when $8::boolean then now() end)
     returning id`,
    [
      zoneId,
      sourceId,
      seed.operation ?? 'rent',
      seed.status,
      seed.attempts ?? 0,
      seed.error ?? null,
      seed.requestedDaysAgo ?? 0,
      seed.completed ?? false,
    ]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error('No se pudo insertar el job de prueba');
  }
  return id;
}

// El último barrido de una operación es `coverage_jobs.last_completed_at` (decisión
// 250), no `zones.last_swept_at` (agregado por zona).
async function setSweptAgo(
  pool: Pool,
  zoneId: string,
  secondsAgo: number,
  operation: 'sale' | 'rent' = 'rent'
): Promise<void> {
  await pool.query(
    `update coverage_jobs set last_completed_at = now() - ($3::integer * interval '1 second')
      where zone_id = $1 and operation = $2`,
    [zoneId, operation, secondsAgo]
  );
}

async function insertSignal(db: Database, zoneId: string, daysAgo: number): Promise<void> {
  await db.execute(sql`
    insert into zone_query_signals (zone_id, day) values (${zoneId}, (now() at time zone 'utc')::date - ${daysAgo}::integer)
  `);
}

describeWithDb('listZoneLifecycle — días desde la última demanda y elegibilidad (ZRS-5, ZRS-8)', () => {
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

  it('S-ZRS-5: sin señales, la referencia es coverage_jobs.requested_at (d = 10), no zones.created_at', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db);
    await pool.query(`update zones set created_at = now() - interval '5 years' where id = $1`, [zoneId]);
    await insertJob(pool, zoneId, sourceId, { status: 'done', requestedDaysAgo: 10 });

    const [snapshot] = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    expect(snapshot?.zoneId).toBe(zoneId);
    expect(snapshot?.daysSinceLastDemand).toBe(10);
  });

  it('sin señales, la referencia de la zona es el requested_at MÁS RECIENTE de sus jobs: ambas operaciones comparten d', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db);
    await insertJob(pool, zoneId, sourceId, { status: 'done', operation: 'rent', requestedDaysAgo: 200 });
    await insertJob(pool, zoneId, sourceId, { status: 'pending', operation: 'sale', requestedDaysAgo: 4 });

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    expect(snapshots.map((snapshot) => snapshot.daysSinceLastDemand)).toEqual([4, 4]);
  });

  it('con señales, la referencia es la MÁS RECIENTE (max(day)), aunque requested_at sea mucho más antiguo', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db);
    await insertJob(pool, zoneId, sourceId, { status: 'done', requestedDaysAgo: 200 });
    await insertSignal(db, zoneId, 40);
    await insertSignal(db, zoneId, 3);

    const [snapshot] = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    expect(snapshot?.daysSinceLastDemand).toBe(3);
  });

  it('una señal nueva de hoy devuelve d = 0 (vuelve a semanal)', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db);
    await insertJob(pool, zoneId, sourceId, { status: 'done', requestedDaysAgo: 120 });
    await insertSignal(db, zoneId, 0);

    const [snapshot] = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    expect(snapshot?.daysSinceLastDemand).toBe(0);
  });

  it('segundos desde el último barrido con el reloj de Postgres; null si la zona nunca se barrió', async () => {
    const sourceId = await insertSource(db);
    const swept = await insertZone(db);
    const never = await insertZone(db);
    await insertJob(pool, swept, sourceId, { status: 'done', completed: true });
    await insertJob(pool, never, sourceId, { status: 'pending' });
    await setSweptAgo(pool, swept, 8 * DAY_SECONDS);

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    const sweptSnapshot = snapshots.find((snapshot) => snapshot.zoneId === swept);
    const neverSnapshot = snapshots.find((snapshot) => snapshot.zoneId === never);
    expect(sweptSnapshot?.secondsSinceLastSweep).toBeGreaterThanOrEqual(8 * DAY_SECONDS);
    expect(sweptSnapshot?.secondsSinceLastSweep).toBeLessThan(8 * DAY_SECONDS + 60);
    expect(neverSnapshot?.secondsSinceLastSweep).toBeNull();
  });

  it('refreshEligible: solo operación cubierta con job done, o failed con reintentos AGOTADOS', async () => {
    const sourceId = await insertSource(db);
    const doneCovered = await insertZone(db, { state: 'covered' });
    const failedExhausted = await insertZone(db, { state: 'covered' });
    const failedRetrying = await insertZone(db, { state: 'covered' });
    const pending = await insertZone(db, { state: 'covered' });
    const running = await insertZone(db, { state: 'covered' });
    const doneNeverCompleted = await insertZone(db, { state: 'covered' });
    await insertJob(pool, doneCovered, sourceId, { status: 'done', completed: true });
    await insertJob(pool, failedExhausted, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS, completed: true });
    await insertJob(pool, failedRetrying, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS - 1, completed: true });
    await insertJob(pool, pending, sourceId, { status: 'pending', completed: true });
    await insertJob(pool, running, sourceId, { status: 'running', completed: true });
    // `zones.state` es agregado y ya no decide: sin `last_completed_at` no hay cobertura.
    await insertJob(pool, doneNeverCompleted, sourceId, { status: 'done' });

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });
    const eligibleZoneIds = snapshots.filter((snapshot) => snapshot.refreshEligible).map((snapshot) => snapshot.zoneId);

    expect(snapshots).toHaveLength(6);
    expect([...eligibleZoneIds].sort()).toEqual([doneCovered, failedExhausted].sort());
  });

  it('una zona con jobs de sale y rent entrega una foto por operación, cada una con SU último barrido y elegibilidad', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    await insertJob(pool, zoneId, sourceId, { status: 'done', operation: 'rent', completed: true });
    await insertJob(pool, zoneId, sourceId, { status: 'pending', operation: 'sale' });
    await setSweptAgo(pool, zoneId, 9 * DAY_SECONDS, 'rent');

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    const byOperation = new Map(snapshots.map((snapshot) => [snapshot.operation, snapshot]));
    expect(snapshots).toHaveLength(2);
    expect(byOperation.get('rent')?.zoneId).toBe(zoneId);
    expect(byOperation.get('rent')?.refreshEligible).toBe(true);
    expect(byOperation.get('rent')?.secondsSinceLastSweep).toBeGreaterThanOrEqual(9 * DAY_SECONDS);
    expect(byOperation.get('sale')?.zoneId).toBe(zoneId);
    expect(byOperation.get('sale')?.refreshEligible).toBe(false);
    expect(byOperation.get('sale')?.secondsSinceLastSweep).toBeNull();
  });

  it('solo lista zonas con job de ESA fuente; una zona sin ningún job no aparece', async () => {
    const sourceId = await insertSource(db);
    const otherSource = await insertSource(db);
    const withJob = await insertZone(db);
    const otherSourceZone = await insertZone(db);
    await insertZone(db);
    await insertJob(pool, withJob, sourceId, { status: 'done', completed: true });
    await insertJob(pool, otherSourceZone, otherSource, { status: 'done' });

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    expect(snapshots.map((snapshot) => snapshot.zoneId)).toEqual([withJob]);
  });
});

describeWithDb('scheduleRefresh — re-encola jobs vencidos sin tocar requested_at (ZRS-8, ZRS-9)', () => {
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

  interface JobRow {
    status: string;
    attempts: number;
    error: string | null;
    requested_at: Date;
    refresh_requested_at: Date | null;
  }

  async function readJob(jobId: string): Promise<JobRow> {
    const { rows } = await pool.query<JobRow>(
      'select status, attempts, error, requested_at, refresh_requested_at from coverage_jobs where id = $1',
      [jobId]
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`No existe el job ${jobId}`);
    }
    return row;
  }

  it('S-ZRS-6: job done de zona covered -> pending, attempts 0, error NULL, refresh_requested_at fijado, requested_at intacto, zona sigue covered', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done', attempts: 1, requestedDaysAgo: 20, completed: true });
    const before = await readJob(jobId);

    const flipped = await scheduleRefresh(db, { sourceId, targets: [{ zoneId, operation: 'rent' }], maxAttempts: MAX_ATTEMPTS });

    expect(flipped).toBe(1);
    const after = await readJob(jobId);
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(0);
    expect(after.error).toBeNull();
    expect(after.refresh_requested_at).not.toBeNull();
    expect(after.requested_at.getTime()).toBe(before.requested_at.getTime());
    const { rows } = await pool.query<{ state: string }>('select state from zones where id = $1', [zoneId]);
    expect(rows[0]?.state).toBe('covered');
  });

  it('S-ZRS-7: job failed con reintentos AGOTADOS también se re-encola, con attempts reiniciado a 0 y el error limpio', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const jobId = await insertJob(pool, zoneId, sourceId, {
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      error: 'fallo de transporte previo',
      completed: true,
    });

    const flipped = await scheduleRefresh(db, { sourceId, targets: [{ zoneId, operation: 'rent' }], maxAttempts: MAX_ATTEMPTS });

    expect(flipped).toBe(1);
    const after = await readJob(jobId);
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(0);
    expect(after.error).toBeNull();
  });

  // Un refresco es un ciclo NUEVO: el job re-encolado debe empezar sin cursor.
  // Si un job `failed` agotado conservara su cursor a mitad de paginación,
  // reanudaría desde ahí, `finishJob(completed)` sellaría `last_swept_at` como
  // barrido completo y S3 (cycle_started_at solo con cursor NULL) nunca abriría
  // un ciclo nuevo.
  it('el re-encolado REINICIA el cursor: un failed agotado con cursor a mitad de paginación queda con cursor NULL', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS, error: 'x', completed: true });
    await pool.query(`update coverage_jobs set cursor = 'cursor-a-mitad-de-paginacion' where id = $1`, [jobId]);

    await scheduleRefresh(db, { sourceId, targets: [{ zoneId, operation: 'rent' }], maxAttempts: MAX_ATTEMPTS });

    const { rows } = await pool.query<{ cursor: string | null; status: string }>(
      'select cursor, status from coverage_jobs where id = $1',
      [jobId]
    );
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.cursor).toBeNull();
  });

  it('un job done (cursor ya NULL) sigue con cursor NULL tras el re-encolado', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done', completed: true });

    await scheduleRefresh(db, { sourceId, targets: [{ zoneId, operation: 'rent' }], maxAttempts: MAX_ATTEMPTS });

    const { rows } = await pool.query<{ cursor: string | null; status: string }>(
      'select cursor, status from coverage_jobs where id = $1',
      [jobId]
    );
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.cursor).toBeNull();
  });

  it('S-ZRS-8: failed con reintentos pendientes, running y pending NO se tocan', async () => {
    const sourceId = await insertSource(db);
    const retrying = await insertZone(db, { state: 'covered' });
    const running = await insertZone(db, { state: 'covered' });
    const pending = await insertZone(db, { state: 'covered' });
    const retryingJob = await insertJob(pool, retrying, sourceId, { status: 'failed', attempts: 1, error: 'x', completed: true });
    const runningJob = await insertJob(pool, running, sourceId, { status: 'running', attempts: 1, completed: true });
    const pendingJob = await insertJob(pool, pending, sourceId, { status: 'pending' });

    const flipped = await scheduleRefresh(db, {
      sourceId,
      targets: [retrying, running, pending].map((zoneId) => ({ zoneId, operation: 'rent' as const })),
      maxAttempts: MAX_ATTEMPTS,
    });

    expect(flipped).toBe(0);
    expect((await readJob(retryingJob)).status).toBe('failed');
    expect((await readJob(runningJob)).status).toBe('running');
    const pendingAfter = await readJob(pendingJob);
    expect(pendingAfter.status).toBe('pending');
    expect(pendingAfter.refresh_requested_at).toBeNull();
  });

  it('solo se re-encolan las zonas pedidas: una elegible que no está en la lista queda intacta', async () => {
    const sourceId = await insertSource(db);
    const asked = await insertZone(db, { state: 'covered' });
    const notAsked = await insertZone(db, { state: 'covered' });
    await insertJob(pool, asked, sourceId, { status: 'done', completed: true });
    const notAskedJob = await insertJob(pool, notAsked, sourceId, { status: 'done', completed: true });

    const flipped = await scheduleRefresh(db, { sourceId, targets: [{ zoneId: asked, operation: 'rent' }], maxAttempts: MAX_ATTEMPTS });

    expect(flipped).toBe(1);
    expect((await readJob(notAskedJob)).status).toBe('done');
  });

  it('una operación sin last_completed_at (no cubierta) no se re-encola aunque su job esté done', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done' });

    const flipped = await scheduleRefresh(db, {
      sourceId,
      targets: [{ zoneId, operation: 'rent' }],
      maxAttempts: MAX_ATTEMPTS,
    });

    expect(flipped).toBe(0);
    expect((await readJob(jobId)).status).toBe('done');
  });

  it('solo se re-encola la operación pedida: pedir rent deja el job done de sale de la misma zona intacto', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'covered' });
    const rentJob = await insertJob(pool, zoneId, sourceId, { status: 'done', operation: 'rent', completed: true });
    const saleJob = await insertJob(pool, zoneId, sourceId, { status: 'done', operation: 'sale', completed: true });

    const flipped = await scheduleRefresh(db, {
      sourceId,
      targets: [{ zoneId, operation: 'rent' }],
      maxAttempts: MAX_ATTEMPTS,
    });

    expect(flipped).toBe(1);
    expect((await readJob(rentJob)).status).toBe('pending');
    expect((await readJob(saleJob)).status).toBe('done');
  });

  it('lista vacía: no toca nada y devuelve 0 (sin sentencia SQL)', async () => {
    const sourceId = await insertSource(db);

    expect(await scheduleRefresh(db, { sourceId, targets: [], maxAttempts: MAX_ATTEMPTS })).toBe(0);
  });
});

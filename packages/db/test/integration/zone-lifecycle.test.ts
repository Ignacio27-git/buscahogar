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
  readonly attempts?: number;
  readonly requestedDaysAgo?: number;
  readonly error?: string | null;
}

async function insertJob(pool: Pool, zoneId: string, sourceId: string, seed: JobSeed): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into coverage_jobs (zone_id, source_id, status, attempts, error, requested_at)
     values ($1, $2, $3, $4, $5, now() - ($6::integer * interval '1 day')) returning id`,
    [zoneId, sourceId, seed.status, seed.attempts ?? 0, seed.error ?? null, seed.requestedDaysAgo ?? 0]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error('No se pudo insertar el job de prueba');
  }
  return id;
}

async function setSweptAgo(pool: Pool, zoneId: string, secondsAgo: number): Promise<void> {
  await pool.query(`update zones set last_swept_at = now() - ($2::integer * interval '1 second') where id = $1`, [
    zoneId,
    secondsAgo,
  ]);
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
    await insertJob(pool, swept, sourceId, { status: 'done' });
    await insertJob(pool, never, sourceId, { status: 'pending' });
    await setSweptAgo(pool, swept, 8 * DAY_SECONDS);

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });

    const sweptSnapshot = snapshots.find((snapshot) => snapshot.zoneId === swept);
    const neverSnapshot = snapshots.find((snapshot) => snapshot.zoneId === never);
    expect(sweptSnapshot?.secondsSinceLastSweep).toBeGreaterThanOrEqual(8 * DAY_SECONDS);
    expect(sweptSnapshot?.secondsSinceLastSweep).toBeLessThan(8 * DAY_SECONDS + 60);
    expect(neverSnapshot?.secondsSinceLastSweep).toBeNull();
  });

  it('refreshEligible: solo zona covered con job done, o failed con reintentos AGOTADOS', async () => {
    const sourceId = await insertSource(db);
    const doneCovered = await insertZone(db, { state: 'covered' });
    const failedExhausted = await insertZone(db, { state: 'covered' });
    const failedRetrying = await insertZone(db, { state: 'covered' });
    const pending = await insertZone(db, { state: 'covered' });
    const running = await insertZone(db, { state: 'covered' });
    const doneUncovered = await insertZone(db, { state: 'uncovered' });
    await insertJob(pool, doneCovered, sourceId, { status: 'done' });
    await insertJob(pool, failedExhausted, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS });
    await insertJob(pool, failedRetrying, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS - 1 });
    await insertJob(pool, pending, sourceId, { status: 'pending' });
    await insertJob(pool, running, sourceId, { status: 'running' });
    await insertJob(pool, doneUncovered, sourceId, { status: 'done' });

    const snapshots = await listZoneLifecycle(db, { sourceId, maxAttempts: MAX_ATTEMPTS });
    const eligibleZoneIds = snapshots.filter((snapshot) => snapshot.refreshEligible).map((snapshot) => snapshot.zoneId);

    expect(snapshots).toHaveLength(6);
    expect([...eligibleZoneIds].sort()).toEqual([doneCovered, failedExhausted].sort());
  });

  it('solo lista zonas con job de ESA fuente; una zona sin ningún job no aparece', async () => {
    const sourceId = await insertSource(db);
    const otherSource = await insertSource(db);
    const withJob = await insertZone(db);
    const otherSourceZone = await insertZone(db);
    await insertZone(db);
    await insertJob(pool, withJob, sourceId, { status: 'done' });
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
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done', attempts: 1, requestedDaysAgo: 20 });
    const before = await readJob(jobId);

    const flipped = await scheduleRefresh(db, { sourceId, zoneIds: [zoneId], maxAttempts: MAX_ATTEMPTS });

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
    });

    const flipped = await scheduleRefresh(db, { sourceId, zoneIds: [zoneId], maxAttempts: MAX_ATTEMPTS });

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
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'failed', attempts: MAX_ATTEMPTS, error: 'x' });
    await pool.query(`update coverage_jobs set cursor = 'cursor-a-mitad-de-paginacion' where id = $1`, [jobId]);

    await scheduleRefresh(db, { sourceId, zoneIds: [zoneId], maxAttempts: MAX_ATTEMPTS });

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
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done' });

    await scheduleRefresh(db, { sourceId, zoneIds: [zoneId], maxAttempts: MAX_ATTEMPTS });

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
    const retryingJob = await insertJob(pool, retrying, sourceId, { status: 'failed', attempts: 1, error: 'x' });
    const runningJob = await insertJob(pool, running, sourceId, { status: 'running', attempts: 1 });
    const pendingJob = await insertJob(pool, pending, sourceId, { status: 'pending' });

    const flipped = await scheduleRefresh(db, {
      sourceId,
      zoneIds: [retrying, running, pending],
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
    await insertJob(pool, asked, sourceId, { status: 'done' });
    const notAskedJob = await insertJob(pool, notAsked, sourceId, { status: 'done' });

    const flipped = await scheduleRefresh(db, { sourceId, zoneIds: [asked], maxAttempts: MAX_ATTEMPTS });

    expect(flipped).toBe(1);
    expect((await readJob(notAskedJob)).status).toBe('done');
  });

  it('una zona que ya no está covered (p. ej. uncovered) no se re-encola aunque su job esté done', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db, { state: 'uncovered' });
    const jobId = await insertJob(pool, zoneId, sourceId, { status: 'done' });

    const flipped = await scheduleRefresh(db, { sourceId, zoneIds: [zoneId], maxAttempts: MAX_ATTEMPTS });

    expect(flipped).toBe(0);
    expect((await readJob(jobId)).status).toBe('done');
  });

  it('lista vacía: no toca nada y devuelve 0 (sin sentencia SQL)', async () => {
    const sourceId = await insertSource(db);

    expect(await scheduleRefresh(db, { sourceId, zoneIds: [], maxAttempts: MAX_ATTEMPTS })).toBe(0);
  });
});

// ROADMAP 3.4 (decisión 259, D17; R6.2, R7.2-R7.4) — avisos operativos de extremo a extremo con los puertos
// REALES (PostgreSQL real, Idealista falso, Telegram FALSO): fuentes de estado y almacén duradero contra la
// base, y el worker completo (`runCoverageWorker`) con el paso de avisos cableado como en producción.
import { coverageJobs, geographyPointWkt } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { composeAlerting, withAlerting } from '../../src/alerts/compose.js';
import type { ComposeAlertingOptions } from '../../src/alerts/compose.js';
import { createDbAlertingSources, createDbAlertingStore } from '../../src/alerts/alert-sources.js';
import type { TelegramFetch } from '../../src/alerts/telegram-notifier.js';
import { createJsonLogger } from '../../src/ops/json-logger.js';
import { createRealCoverageWorkerPorts } from '../../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../../src/sweep/coverage-worker.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import { startFakeTelegram } from '../../scripts/fake-telegram.js';
import { loopbackFetch } from '../helpers/loopback-fetch.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource, insertSourceWithQuota, seedMonthlyQuota } from './helpers/seed-fixtures.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const BLOCKING_THRESHOLDS = { radiusMeters: 300, priceBandCents: 2500000, surfaceToleranceM2: 10 };
const OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 1,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
};
const TOKEN = '123456789:AAE-secret_token_value';
const CHAT_ID = '-1001234567890';

const emptySearchPort: IdealistaSearchPort = {
  search(): Promise<TransportOutcome> {
    return Promise.resolve({
      kind: 'ok',
      status: 200,
      headers: {},
      body: { elementList: [], totalPages: 1, actualPage: 1, itemsPerPage: 50, total: 0 },
    });
  },
};
const fakeTokenPort: IdealistaTokenPort = {
  acquire(): Promise<TransportOutcome> {
    return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
  },
};

describe('avisos operativos con PostgreSQL real (decisión 259)', () => {
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

  async function insertJob(
    sourceId: string,
    overrides: Partial<typeof coverageJobs.$inferInsert> = {},
    finishedAgo?: string
  ): Promise<string> {
    const { zoneId } = await insertLocationWithZone(db, { centroid: geographyPointWkt(GRANADA), sweepRadiusM: 4500 });
    const [row] = await db
      .insert(coverageJobs)
      .values({ zoneId, sourceId, operation: 'sale', ...overrides })
      .returning({ id: coverageJobs.id });
    const id = row?.id ?? '';
    if (finishedAgo !== undefined) {
      await pool.query('update coverage_jobs set finished_at = now() - $2::interval where id = $1', [id, finishedAgo]);
    }
    return id;
  }

  describe('fuentes de estado y almacén', () => {
    it('countFailedJobs cuenta solo los failed cuyo fin cae dentro de la ventana (reloj de la base)', async () => {
      const sourceId = await insertSource(db);
      await insertJob(sourceId, { status: 'failed' }, '1 hour');
      await insertJob(sourceId, { status: 'failed' }, '23 hours');
      await insertJob(sourceId, { status: 'failed' }, '25 hours');
      await insertJob(sourceId, { status: 'done' }, '1 hour');
      await insertJob(sourceId, { status: 'pending' });
      const sources = createDbAlertingSources(db, sourceId);

      expect(await sources.countFailedJobs(24 * 3_600_000)).toBe(2);
      expect(await sources.countFailedJobs(2 * 3_600_000)).toBe(1);
    });

    it('readQuota: null sin fila mensual; con fila, total y gasto del mes en curso', async () => {
      const sourceId = await insertSource(db);
      const sources = createDbAlertingSources(db, sourceId);
      expect(await sources.readQuota()).toBeNull();

      await seedMonthlyQuota(db, sourceId, { totalCap: 1000, reserve: 100, batch: 300, onDemand: 50 });

      expect(await sources.readQuota()).toEqual({ totalCap: 1000, searchRequests: 350 });
    });

    it('el almacén registra, lee y purga contra alert_dispatch_log', async () => {
      const store = createDbAlertingStore(db);
      await store.record('worker-started', new Date('2026-06-01T00:00:00.000Z'));
      await store.record('quota-80:2026-10', new Date('2026-10-01T00:00:00.000Z'));

      const times = await store.readTimes(['worker-started', 'otra']);
      expect([...times.keys()]).toEqual(['worker-started']);

      expect(await store.purge(new Date('2026-09-01T00:00:00.000Z'))).toBe(1);
      expect((await store.readTimes(['worker-started'])).size).toBe(0);
    });
  });

  describe('worker completo con Telegram falso', () => {
    interface Run {
      readonly messages: string[];
      readonly lines: string[];
      readonly sleeps: number[];
      readonly telegramCalls: { url: string; chatId: unknown }[];
    }

    async function runWorker(sourceId: string, overrides: Partial<ComposeAlertingOptions> = {}): Promise<Run> {
      const messages: string[] = [];
      const lines: string[] = [];
      const sleeps: number[] = [];
      const telegramCalls: { url: string; chatId: unknown }[] = [];
      const log = createJsonLogger({ component: 'coverage-worker', redact: [TOKEN], write: (line) => lines.push(line) });
      const fetchFn: TelegramFetch = (url, init) => {
        const body = JSON.parse(init.body) as { chat_id: unknown; text: string };
        telegramCalls.push({ url, chatId: body.chat_id });
        messages.push(body.text);
        return Promise.resolve({ ok: true, status: 200 });
      };
      const alerting = composeAlerting({
        db,
        sourceId,
        telegram: { botToken: TOKEN, chatId: CHAT_ID },
        alerts: { failedJobsThreshold: 5, failedJobsWindowMs: 24 * 3_600_000, cooldownMs: 6 * 3_600_000 },
        fetchFn,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        now: () => new Date(),
        log,
        ...overrides,
      });
      const basePorts = createRealCoverageWorkerPorts({
        db,
        sourceUuid: sourceId,
        searchPort: emptySearchPort,
        tokenPort: fakeTokenPort,
        maxSearchRequestsPerSweep: 10,
        maxAttempts: 3,
        dailySearchCap: 500,
        blockingThresholds: BLOCKING_THRESHOLDS,
        staleRunningJobAfterMs: 120_000,
        io: { log: (line) => lines.push(line) },
      });
      await runCoverageWorker(withAlerting(basePorts, alerting), OPTIONS);
      return { messages, lines, sleeps, telegramCalls };
    }

    it('10 jobs fallidos en un tick producen UN aviso agregado de fallos (no uno por job) hacia el chat configurado', async () => {
      const sourceId = await insertSourceWithQuota(db);
      for (let index = 0; index < 10; index += 1) {
        await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
      }

      const run = await runWorker(sourceId);

      const failures = run.messages.filter((text) => text.includes('Fallos de cobertura'));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain('10 jobs');
      expect(run.messages.length).toBeLessThanOrEqual(3);
      expect(run.telegramCalls.every((call) => call.chatId === CHAT_ID)).toBe(true);
      expect(run.telegramCalls.every((call) => call.url.includes(`/bot${TOKEN}/sendMessage`))).toBe(true);
    });

    it('varias condiciones a la vez: como mucho 3 mensajes, el exceso en un resumen, y todo queda registrado en la base', async () => {
      // Sin cuota mensual: el job pendiente se selecciona, la reserva se deniega y se avisa de ello.
      const sourceId = await insertSource(db);
      for (let index = 0; index < 6; index += 1) {
        await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
      }
      await insertJob(sourceId, { status: 'pending' });
      await insertJob(sourceId, { status: 'running', attempts: 1 }).then((id) =>
        pool.query("update coverage_jobs set lease_renewed_at = now() - interval '1 hour' where id = $1", [id])
      );

      const run = await runWorker(sourceId);

      expect(run.messages.length).toBeLessThanOrEqual(3);
      expect(run.messages.length).toBeGreaterThanOrEqual(2);
      expect(run.messages.some((text) => text.startsWith('+'))).toBe(true);
      const keys = await pool.query<{ dedup_key: string }>('select dedup_key from alert_dispatch_log order by 1');
      expect(keys.rows.length).toBeGreaterThanOrEqual(1);
      expect(run.sleeps.every((ms) => ms > 0)).toBe(true);
    });

    it('con TELEGRAM_API_BASE_URL apuntando al Telegram falso (HTTP real en el bucle local) el aviso llega al chat', async () => {
      const fake = await startFakeTelegram();
      try {
        const sourceId = await insertSourceWithQuota(db);
        for (let index = 0; index < 6; index += 1) {
          await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
        }

        await runWorker(sourceId, { apiBaseUrl: fake.url, fetchFn: (url, init) => loopbackFetch(url, init) });

        expect(fake.requests.length).toBeGreaterThanOrEqual(1);
        expect(fake.requests.length).toBeLessThanOrEqual(3);
        expect(fake.requests.every((received) => received.chatId === CHAT_ID && received.tokenValid)).toBe(true);
        expect(fake.requests.some((received) => received.text?.includes('Fallos de cobertura'))).toBe(true);
        expect(JSON.stringify(fake.requests)).not.toContain('AAE-secret');
      } finally {
        await fake.close();
      }
    });

    it('la recuperación de un job atascado emite su aviso con la clave del día UTC y queda registrada', async () => {
      const sourceId = await insertSourceWithQuota(db);
      const jobId = await insertJob(sourceId, { status: 'running', attempts: 1, startedAt: new Date() });
      await pool.query("update coverage_jobs set lease_renewed_at = now() - interval '1 hour' where id = $1", [jobId]);

      const run = await runWorker(sourceId);

      expect(run.messages.some((text) => text.includes('Jobs atascados recuperados'))).toBe(true);
      const key = await pool.query<{ dedup_key: string }>(
        "select dedup_key from alert_dispatch_log where dedup_key like 'stale-reclaim:%'"
      );
      expect(key.rows).toHaveLength(1);
      expect(key.rows[0]?.dedup_key).toBe(`stale-reclaim:${new Date().toISOString().slice(0, 10)}`);
    });

    it('un REINICIO del worker dentro del enfriamiento no reenvía lo ya avisado (deduplicación duradera)', async () => {
      const sourceId = await insertSourceWithQuota(db);
      for (let index = 0; index < 6; index += 1) {
        await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
      }
      const first = await runWorker(sourceId);
      expect(first.messages.length).toBeGreaterThanOrEqual(1);

      const second = await runWorker(sourceId);

      expect(second.messages).toEqual([]);
    });

    it('sin token/chat: ningún intento de red ni lectura de estado, y el worker completa su tick', async () => {
      const sourceId = await insertSourceWithQuota(db);
      for (let index = 0; index < 6; index += 1) {
        await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
      }
      const lines: string[] = [];
      let fetchCalls = 0;
      const alerting = composeAlerting({
        db,
        sourceId,
        telegram: undefined,
        alerts: { failedJobsThreshold: 5, failedJobsWindowMs: 24 * 3_600_000, cooldownMs: 6 * 3_600_000 },
        fetchFn: () => {
          fetchCalls += 1;
          return Promise.resolve({ ok: true, status: 200 });
        },
        sleep: () => Promise.resolve(),
        now: () => new Date(),
        log: createJsonLogger({ component: 'coverage-worker', write: (line) => lines.push(line) }),
      });
      const basePorts = createRealCoverageWorkerPorts({
        db,
        sourceUuid: sourceId,
        searchPort: emptySearchPort,
        tokenPort: fakeTokenPort,
        maxSearchRequestsPerSweep: 10,
        maxAttempts: 3,
        dailySearchCap: 500,
        blockingThresholds: BLOCKING_THRESHOLDS,
        io: { log: (line) => lines.push(line) },
      });

      const ports = withAlerting(basePorts, alerting);
      await runCoverageWorker(ports, OPTIONS);

      expect(alerting.enabled).toBe(false);
      expect(ports).toBe(basePorts);
      expect(fetchCalls).toBe(0);
      const rows = await pool.query<{ count: string }>('select count(*) from alert_dispatch_log');
      expect(Number(rows.rows[0]?.count)).toBe(0);
    });

    it('un Telegram que responde 500 no rompe el worker: el tick termina y no se registra nada como enviado', async () => {
      const sourceId = await insertSourceWithQuota(db);
      for (let index = 0; index < 6; index += 1) {
        await insertJob(sourceId, { status: 'failed', attempts: 3 }, '1 hour');
      }

      const run = await runWorker(sourceId, { fetchFn: () => Promise.resolve({ ok: false, status: 500 }) });

      expect(run.lines.some((line) => line.includes('alert-send-failed'))).toBe(true);
      expect(run.lines.join('\n')).not.toContain(TOKEN);
      const rows = await pool.query<{ count: string }>('select count(*) from alert_dispatch_log');
      expect(Number(rows.rows[0]?.count)).toBe(0);
      const state = await db.execute<{ n: number }>(sql`select count(*)::int as n from coverage_jobs`);
      expect(state.rows[0]?.n).toBeGreaterThanOrEqual(6);
    });
  });
});

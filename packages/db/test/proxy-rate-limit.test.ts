// ROADMAP 3.4 (decisión 255, D2/D3; R1.1-R1.4) — el almacén compartido del limitador de ventana fija:
// incremento atómico, equivalencia con la lógica pura del núcleo y purga perezosa acotada.
import { evaluateFixedWindow, fixedWindowVerdict } from '@buscahogar/core';
import type { FixedWindowState } from '@buscahogar/core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../src/db.js';
import { createPgProxyRateLimitStore, PROXY_RATE_LIMIT_PURGE_BATCH } from '../src/proxy-rate-limit.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

const PARAMS = { max: 30, windowMs: 60_000 };

describeWithDb('createPgProxyRateLimitStore — almacén compartido (decisión 255)', () => {
  let pool: Pool;
  let db: ReturnType<typeof connectTestDb>['db'];

  beforeAll(() => {
    ({ pool, db } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  async function rowOf(key: string): Promise<{ window_start_ms: string; hits: number } | undefined> {
    const { rows } = await pool.query<{ window_start_ms: string; hits: number }>(
      'select window_start_ms::text, hits from proxy_rate_limit where key_hash = $1',
      [key]
    );
    return rows[0];
  }

  async function seedExpired(count: number, prefix: string, windowStartMs: number): Promise<void> {
    await pool.query(
      `insert into proxy_rate_limit (key_hash, window_start_ms, hits)
       select $1::text || g, $2::bigint, 1 from generate_series(1, $3::int) g`,
      [prefix, windowStartMs, count]
    );
  }

  it('la primera petición abre la ventana con hits = 1 y windowStart = nowMs', async () => {
    const store = createPgProxyRateLimitStore(db);

    const state = await store.hit('k', 1_000, PARAMS);

    expect(state).toEqual({ count: 1, windowStart: 1_000 });
    expect(await rowOf('k')).toEqual({ window_start_ms: '1000', hits: 1 });
  });

  it('dentro de la ventana suma sin mover windowStart; el estado devuelto es el de la petición evaluada', async () => {
    const store = createPgProxyRateLimitStore(db);
    await store.hit('k', 1_000, PARAMS);

    const second = await store.hit('k', 5_000, PARAMS);

    expect(second).toEqual({ count: 2, windowStart: 1_000 });
  });

  it('ventana transcurrida: reinicia en hits = 1 con windowStart = nowMs; un instante antes del borde sigue dentro', async () => {
    const store = createPgProxyRateLimitStore(db);
    await store.hit('k', 0, PARAMS);
    await store.hit('k', 10, PARAMS);

    const restarted = await store.hit('k', 60_000, PARAMS);

    expect(restarted).toEqual({ count: 1, windowStart: 60_000 });
    await store.hit('other', 0, PARAMS);
    const stillInside = await store.hit('other', 59_999, PARAMS);
    expect(stillInside).toEqual({ count: 2, windowStart: 0 });
  });

  it('hits se limita a max + 1 (un cliente abusivo no desborda el contador)', async () => {
    const store = createPgProxyRateLimitStore(db);
    const params = { max: 3, windowMs: 60_000 };
    const counts: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      counts.push((await store.hit('k', 100 + i, params)).count);
    }

    expect(counts).toEqual([1, 2, 3, 4, 4, 4, 4, 4]);
    expect((await rowOf('k'))?.hits).toBe(4);
  });

  it('el cubo unknown es una clave más: lo comparten todas las peticiones sin IP resoluble', async () => {
    const store = createPgProxyRateLimitStore(db);

    await store.hit('unknown', 10, PARAMS);
    const second = await store.hit('unknown', 20, PARAMS);

    expect(second.count).toBe(2);
    const { rows } = await pool.query('select 1 from proxy_rate_limit');
    expect(rows).toHaveLength(1);
  });

  it('atómico: 40 peticiones concurrentes sobre la misma clave suman exactamente 40', async () => {
    const store = createPgProxyRateLimitStore(db);
    const params = { max: 100, windowMs: 60_000 };

    const states = await Promise.all(Array.from({ length: 40 }, () => store.hit('hot', 500, params)));

    expect((await rowOf('hot'))?.hits).toBe(40);
    // Cada petición vio un contador distinto: nadie leyó-modificó-escribió sobre el mismo valor.
    expect(new Set(states.map((state) => state.count)).size).toBe(40);
  });

  it('dos instancias del almacén (dos pools) comparten el contador: la petición 31 se rechaza con el veredicto del núcleo', async () => {
    const other = createDb(process.env.DATABASE_URL ?? '');
    try {
      const storeA = createPgProxyRateLimitStore(db);
      const storeB = createPgProxyRateLimitStore(other.db);
      let last: FixedWindowState | undefined;
      for (let i = 1; i <= 31; i += 1) {
        last = await (i % 2 === 0 ? storeA : storeB).hit('shared', 1_000 + i, PARAMS);
      }

      expect(last).toEqual({ count: 31, windowStart: 1_001 });
      expect(fixedWindowVerdict(last as FixedWindowState, 1_031, PARAMS)).toEqual({
        allowed: false,
        retryAfterSeconds: 60,
      });
    } finally {
      await other.pool.end();
    }
  });

  it('equivalencia con el núcleo: la misma secuencia produce el mismo veredicto en SQL y en evaluateFixedWindow', async () => {
    const store = createPgProxyRateLimitStore(db);
    const params = { max: 3, windowMs: 1_000 };
    const instants = [0, 100, 200, 300, 999, 1_000, 1_001, 1_002, 1_003, 1_004, 2_500, 2_501];
    let memory: FixedWindowState | undefined;
    let denied = 0;
    for (const nowMs of instants) {
      const expected = evaluateFixedWindow(memory, nowMs, params);
      memory = expected.state;
      const state = await store.hit('eq', nowMs, params);
      const verdict = fixedWindowVerdict(state, nowMs, params);

      expect(verdict.allowed).toBe(expected.allowed);
      expect(verdict.retryAfterSeconds).toBe(expected.retryAfterSeconds);
      expect(state.windowStart).toBe(expected.state.windowStart);
      denied += verdict.allowed ? 0 : 1;
    }
    // Control: la secuencia incluyó rechazos y reinicios de ventana, no solo permitidos.
    expect(denied).toBeGreaterThan(3);
  });

  describe('purga perezosa acotada (R1.4)', () => {
    it('borra como mucho PROXY_RATE_LIMIT_PURGE_BATCH filas vencidas por petición y solo las vencidas', async () => {
      expect(PROXY_RATE_LIMIT_PURGE_BATCH).toBe(100);
      await seedExpired(130, 'old-', 0);
      await seedExpired(5, 'fresh-', 99_000);
      const store = createPgProxyRateLimitStore(db);

      await store.hit('now', 100_000, PARAMS);

      const { rows } = await pool.query<{ prefix: string; n: string }>(
        "select split_part(key_hash, '-', 1) as prefix, count(*)::text as n from proxy_rate_limit group by 1 order by 1"
      );
      expect(rows).toEqual([
        { prefix: 'fresh', n: '5' },
        { prefix: 'now', n: '1' },
        { prefix: 'old', n: '30' },
      ]);
    });

    it('nunca purga la propia clave: una fila propia vencida se reinicia en su sitio', async () => {
      await pool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('mine', 0, 9)");
      const store = createPgProxyRateLimitStore(db);

      const state = await store.hit('mine', 100_000, PARAMS);

      expect(state).toEqual({ count: 1, windowStart: 100_000 });
    });

    it('SKIP LOCKED: una fila vencida bloqueada por otra transacción no hace esperar la petición y se conserva', async () => {
      await seedExpired(2, 'old-', 0);
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query("select 1 from proxy_rate_limit where key_hash = 'old-1' for update");
        const store = createPgProxyRateLimitStore(db);

        const started = Date.now();
        await store.hit('now', 100_000, PARAMS);

        expect(Date.now() - started).toBeLessThan(2_000);
        expect(await rowOf('old-1')).toBeDefined();
        expect(await rowOf('old-2')).toBeUndefined();
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    });
  });
});

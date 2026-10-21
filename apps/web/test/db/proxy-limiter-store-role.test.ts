// ROADMAP 3.4 (decisión 255, D2/D5/D5b; PD9) — el limitador completo con la credencial REAL `web_coverage`
// (la que usa el proxy en producción): la sentencia atómica (purga acotada + upsert con RETURNING)
// funciona con exactamente SELECT/INSERT/UPDATE/DELETE, y un almacén inalcanzable no tumba la petición.
// Gateada en `WEB_COVERAGE_DATABASE_URL`: sin ella se OMITE, nunca falla.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, createPgProxyRateLimitStore } from '@buscahogar/db';

import { createProxyRateLimiter } from '../../src/server/proxy-rate-limit.js';
import { connectTestDb } from '../helpers/db-client.js';

const coverageProvisioned = Boolean(process.env.WEB_COVERAGE_DATABASE_URL);
const PARAMS = { max: 30, windowMs: 60_000 };

type Pool = ReturnType<typeof connectTestDb>['pool'];

describe.skipIf(!coverageProvisioned)('limitador con la credencial web_coverage real (decisión 255)', () => {
  let ownerPool: Pool;
  let coverage: ReturnType<typeof createDb>;

  beforeAll(() => {
    ({ pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- skipIf ya garantiza que la variable existe
    coverage = createDb(process.env.WEB_COVERAGE_DATABASE_URL!, { max: 4 });
  });

  afterAll(async () => {
    await ownerPool.end();
    await coverage.pool.end();
  });

  beforeEach(async () => {
    await ownerPool.query('delete from proxy_rate_limit');
  });

  it('la petición 31 de una misma clave se rechaza, contando con web_coverage', async () => {
    const limiter = createProxyRateLimiter({ store: createPgProxyRateLimitStore(coverage.db) });
    const results = [];
    for (let i = 1; i <= 31; i += 1) {
      results.push(await limiter.hit('real-role', 1_000 + i, PARAMS));
    }

    expect(results.filter((result) => result.allowed)).toHaveLength(30);
    expect(results[30]).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('la purga acotada borra filas vencidas con web_coverage (necesita DELETE) y deja las vigentes', async () => {
    await ownerPool.query(
      `insert into proxy_rate_limit (key_hash, window_start_ms, hits)
       select 'old-' || g, 0, 1 from generate_series(1, 10) g`
    );
    await ownerPool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('fresh', 99000, 1)");
    const limiter = createProxyRateLimiter({ store: createPgProxyRateLimitStore(coverage.db) });

    await limiter.hit('trigger', 100_000, PARAMS);

    const { rows } = await ownerPool.query<{ key_hash: string }>('select key_hash from proxy_rate_limit order by 1');
    expect(rows.map((row) => row.key_hash)).toEqual(['fresh', 'trigger']);
  });

  it('con la base de datos inalcanzable la petición se PERMITE en menos de 400 ms y se registra una línea', async () => {
    const unreachable = createDb('postgresql://web_coverage:x@127.0.0.1:1/none', {
      max: 4,
      connectionTimeoutMillis: 150,
      query_timeout: 150,
    });
    const log = vi.fn();
    try {
      const limiter = createProxyRateLimiter({ store: createPgProxyRateLimitStore(unreachable.db), log });

      const started = Date.now();
      const result = await limiter.hit('any', 0, PARAMS);

      expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
      expect(Date.now() - started).toBeLessThan(400);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      await unreachable.pool.end();
    }
  });
});

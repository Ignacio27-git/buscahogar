// ROADMAP 3.4 (decisión 263, D8) — `pingDatabase` es la sonda de `/api/health`: un `select 1` que
// resuelve si la base responde y rechaza si no. Vive aquí porque `apps/web` no depende de drizzle-orm.
import type { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDb } from '../src/db.js';
import { pingDatabase } from '../src/ping.js';
import { connectTestDb } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

describeWithDb('pingDatabase — sonda de salud (decisión 263)', () => {
  let pool: Pool;
  let db: ReturnType<typeof connectTestDb>['db'];

  beforeAll(() => {
    ({ pool, db } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  it('resuelve cuando la base de datos responde', async () => {
    await expect(pingDatabase(db)).resolves.toBeUndefined();
  });

  it('rechaza cuando la conexión no es posible (puerto cerrado), sin colgarse', async () => {
    const closed = createDb('postgres://nobody:nothing@127.0.0.1:1/none', { connectionTimeoutMillis: 500 });
    try {
      await expect(pingDatabase(closed.db)).rejects.toThrow();
    } finally {
      await closed.pool.end();
    }
  });
});

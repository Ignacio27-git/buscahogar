// ROADMAP 3.3 (decisión 248; D13; S3.2) — `setMonthlyQuota`: fija el total y la reserva de
// un mes (upsert) y NUNCA toca los contadores de gasto. El respaldo estructural son los
// CHECK de `monthly_request_budget`: un total por debajo de lo ya gastado, o una reserva
// >= total, falla y deja el registro intacto.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { reserveRequestBudget, setMonthlyQuota } from '../src/budget-ledger.js';
import type { Database } from '../src/db.js';
import { sources } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `quota-source-${randomUUID()}`, name: 'Fuente de cuota', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

async function rows(db: Database): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    select month::text as month, total_cap, reserve, search_requests, batch_requests, token_requests
    from monthly_request_budget order by month
  `);
  return result.rows;
}

describeWithDb('setMonthlyQuota — upsert de total y reserva (decisión 248, D13)', () => {
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

  it('crea la fila del mes con los contadores a 0 y devuelve lo guardado', async () => {
    const sourceId = await insertSource(db);

    const stored = await setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 1000, reserve: 200 });

    expect(stored).toEqual({ month: '2026-10-01', totalCap: 1000, reserve: 200, searchRequests: 0 });
    expect(await rows(db)).toEqual([
      { month: '2026-10-01', total_cap: 1000, reserve: 200, search_requests: 0, batch_requests: 0, token_requests: 0 },
    ]);
  });

  it('una segunda llamada ACTUALIZA total y reserva y no toca el gasto ya registrado', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 100, reserve: 30 });
    await db.execute(sql`
      update monthly_request_budget set search_requests = 40, batch_requests = 40, token_requests = 3
      where source_id = ${sourceId}
    `);

    const stored = await setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 500, reserve: 50 });

    expect(stored).toEqual({ month: '2026-10-01', totalCap: 500, reserve: 50, searchRequests: 40 });
    expect(await rows(db)).toEqual([
      { month: '2026-10-01', total_cap: 500, reserve: 50, search_requests: 40, batch_requests: 40, token_requests: 3 },
    ]);
  });

  it('meses distintos son filas distintas, y fijar uno no cambia el otro', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 100, reserve: 30 });

    await setMonthlyQuota(db, sourceId, { month: '2026-11-01', totalCap: 200, reserve: 0 });

    expect((await rows(db)).map((row) => [row.month, row.total_cap, row.reserve])).toEqual([
      ['2026-10-01', 100, 30],
      ['2026-11-01', 200, 0],
    ]);
  });

  it('reserva >= total falla por CHECK y deja el registro intacto', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 100, reserve: 30 });

    await expect(setMonthlyQuota(db, sourceId, { month: '2026-10-01', totalCap: 100, reserve: 100 })).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    await expect(setMonthlyQuota(db, sourceId, { month: '2026-12-01', totalCap: 50, reserve: 80 })).rejects.toMatchObject({
      cause: { code: '23514' },
    });

    expect((await rows(db)).map((row) => [row.month, row.total_cap, row.reserve])).toEqual([['2026-10-01', 100, 30]]);
  });

  it('bajar el total por debajo de lo ya gastado falla por CHECK (no se pierde el gasto) y el registro no cambia', async () => {
    const sourceId = await insertSource(db);
    // Mes en curso real: el gasto se registra por la ruta de producción.
    const { rows: monthRows } = await db.execute<{ month: string }>(
      sql`select date_trunc('month', now() at time zone 'utc')::date::text as month`
    );
    const month = monthRows[0]?.month ?? '';
    await setMonthlyQuota(db, sourceId, { month, totalCap: 100, reserve: 30 });
    await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 50, tokenReserved: 0 });

    await expect(setMonthlyQuota(db, sourceId, { month, totalCap: 40, reserve: 10 })).rejects.toMatchObject({
      cause: { code: '23514' },
    });

    expect(await rows(db)).toMatchObject([{ total_cap: 100, reserve: 30, search_requests: 50 }]);
  });
});

// ROADMAP 3.4 (decisión 257, D12; R5.6) — siembra de la cuota mensual del despliegue: SOLO si la fuente no
// tiene NINGUNA fila en `monthly_request_budget` (nunca sobrescribe lo que fijó el responsable con
// `set-monthly-quota`, decisión 248). Una sola sentencia atómica (`INSERT ... WHERE NOT EXISTS`).
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { seedMonthlyQuotaIfEmpty, setMonthlyQuota } from '../../src/budget-ledger.js';
import type { Database } from '../../src/db.js';
import { sources } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';

async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `seed-source-${randomUUID()}`, name: 'Fuente de siembra', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

async function currentMonth(db: Database): Promise<string> {
  const { rows } = await db.execute<{ month: string }>(
    sql`select date_trunc('month', now() at time zone 'utc')::date::text as month`
  );
  return rows[0]?.month ?? '';
}

async function rows(db: Database): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    select month::text as month, total_cap, reserve, search_requests, batch_requests, token_requests
    from monthly_request_budget order by month
  `);
  return result.rows;
}

describeWithDb('seedMonthlyQuotaIfEmpty — solo si la fuente no tiene ninguna fila (decisión 257, D12)', () => {
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

  it('con la tabla vacía inserta la fila del mes UTC en curso con los contadores a 0', async () => {
    const sourceId = await insertSource(db);
    const month = await currentMonth(db);

    const result = await seedMonthlyQuotaIfEmpty(db, sourceId, { totalCap: 1000, reserve: 200 });

    expect(result).toEqual({ seeded: true, month });
    expect(await rows(db)).toEqual([
      { month, total_cap: 1000, reserve: 200, search_requests: 0, batch_requests: 0, token_requests: 0 },
    ]);
  });

  it('una segunda llamada con otros valores no cambia nada', async () => {
    const sourceId = await insertSource(db);
    await seedMonthlyQuotaIfEmpty(db, sourceId, { totalCap: 1000, reserve: 200 });
    const before = await rows(db);

    const result = await seedMonthlyQuotaIfEmpty(db, sourceId, { totalCap: 9999, reserve: 1 });

    expect(result).toEqual({ seeded: false });
    expect(await rows(db)).toEqual(before);
  });

  it('una fila editada por el responsable (incluso de otro mes) cuenta como «no vacía» y se conserva', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: '2026-01-01', totalCap: 300, reserve: 30 });
    await db.execute(sql`update monthly_request_budget set search_requests = 40, batch_requests = 40 where source_id = ${sourceId}`);

    const result = await seedMonthlyQuotaIfEmpty(db, sourceId, { totalCap: 1000, reserve: 200 });

    expect(result).toEqual({ seeded: false });
    expect(await rows(db)).toEqual([
      { month: '2026-01-01', total_cap: 300, reserve: 30, search_requests: 40, batch_requests: 40, token_requests: 0 },
    ]);
  });

  it('las filas de OTRA fuente no impiden sembrar esta', async () => {
    const other = await insertSource(db);
    const mine = await insertSource(db);
    await setMonthlyQuota(db, other, { month: '2026-01-01', totalCap: 300, reserve: 30 });

    const result = await seedMonthlyQuotaIfEmpty(db, mine, { totalCap: 1000, reserve: 200 });

    expect(result.seeded).toBe(true);
    const { rows: count } = await db.execute<{ total: string }>(
      sql`select count(*)::text as total from monthly_request_budget where source_id = ${mine}`
    );
    expect(count[0]?.total).toBe('1');
  });

  it('valores que violan los CHECK (reserva >= total) fallan con error y no dejan fila', async () => {
    const sourceId = await insertSource(db);

    await expect(seedMonthlyQuotaIfEmpty(db, sourceId, { totalCap: 100, reserve: 100 })).rejects.toThrow();

    expect(await rows(db)).toEqual([]);
  });
});

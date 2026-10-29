// ROADMAP 3.3 (decisión 248; R3; S3.2, S3.3) — `runSetMonthlyQuota` contra PostgreSQL real:
// guarda total y reserva (reserva 0 explícita incluida), no toca el gasto del mes y, si la base
// rechaza el ajuste, informa y deja el registro como estaba. Sin red.
import { reserveRequestBudget } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseSetMonthlyQuotaArgs, runSetMonthlyQuota } from '../../src/quota/set-monthly-quota.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertSource } from './helpers/seed-fixtures.js';

const NOW = new Date();

async function monthlyRows(db: Database): Promise<Record<string, unknown>[]> {
  const { rows } = await db.execute(sql`
    select month::text as month, total_cap, reserve, search_requests from monthly_request_budget order by month
  `);
  return rows;
}

describe('runSetMonthlyQuota — contra PostgreSQL real', () => {
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

  it('guarda total y reserva del mes indicado y lo cuenta en el informe', async () => {
    const sourceId = await insertSource(db);
    const logged: string[] = [];

    const code = await runSetMonthlyQuota(
      db,
      sourceId,
      parseSetMonthlyQuotaArgs(['--total', '1000', '--reserve', '200', '--month', '2026-12'], NOW),
      { log: (line) => logged.push(line) }
    );

    expect(code).toBe(0);
    expect(await monthlyRows(db)).toEqual([{ month: '2026-12-01', total_cap: 1000, reserve: 200, search_requests: 0 }]);
    expect(logged.join('\n')).toContain('total=1000, reserva=200, techo del batch=800');
  });

  it('S3.3: la reserva 0 pasada explícitamente se guarda', async () => {
    const sourceId = await insertSource(db);

    const code = await runSetMonthlyQuota(
      db,
      sourceId,
      parseSetMonthlyQuotaArgs(['--total', '500', '--reserve', '0', '--month', '2026-12'], NOW),
      { log: () => undefined }
    );

    expect(code).toBe(0);
    expect(await monthlyRows(db)).toEqual([{ month: '2026-12-01', total_cap: 500, reserve: 0, search_requests: 0 }]);
  });

  it('S3.2: un argv inválido (reserva >= total) se rechaza ANTES de la base: el registro sigue vacío', async () => {
    await insertSource(db);

    expect(() => parseSetMonthlyQuotaArgs(['--total', '100', '--reserve', '100'], NOW)).toThrow(/menor que el total/);
    expect(await monthlyRows(db)).toEqual([]);
  });

  it('el mes por defecto es el mes UTC en curso y reservar después gasta sobre esa fila', async () => {
    const sourceId = await insertSource(db);
    await runSetMonthlyQuota(db, sourceId, parseSetMonthlyQuotaArgs(['--total', '100', '--reserve', '30'], new Date()), {
      log: () => undefined,
    });

    const result = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 5, tokenReserved: 0 });

    expect(result).toMatchObject({ granted: true, searchGranted: 5 });
    expect(await monthlyRows(db)).toMatchObject([{ total_cap: 100, reserve: 30, search_requests: 5 }]);
  });

  it('volver a fijar la cuota conserva el gasto del mes; bajar el total por debajo del gasto lo rechaza la base (salida 1) y no cambia nada', async () => {
    const sourceId = await insertSource(db);
    const args = parseSetMonthlyQuotaArgs(['--total', '100', '--reserve', '30'], new Date());
    await runSetMonthlyQuota(db, sourceId, args, { log: () => undefined });
    await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 50, tokenReserved: 0 });

    const raised = await runSetMonthlyQuota(db, sourceId, parseSetMonthlyQuotaArgs(['--total', '300', '--reserve', '60'], new Date()), {
      log: () => undefined,
    });
    expect(raised).toBe(0);
    expect(await monthlyRows(db)).toMatchObject([{ total_cap: 300, reserve: 60, search_requests: 50 }]);

    const logged: string[] = [];
    const lowered = await runSetMonthlyQuota(db, sourceId, parseSetMonthlyQuotaArgs(['--total', '40', '--reserve', '10'], new Date()), {
      log: (line) => logged.push(line),
    });
    expect(lowered).toBe(1);
    expect(logged.join('\n')).toContain('el registro queda como estaba');
    expect(await monthlyRows(db)).toMatchObject([{ total_cap: 300, reserve: 60, search_requests: 50 }]);
  });
});

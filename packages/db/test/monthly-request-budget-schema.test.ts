// ROADMAP 3.3 (decisión 248; diseño D4; migración 0019) — la tabla del registro
// MENSUAL de cuota y sus CHECK estructurales: el respaldo de base de datos frente a
// cualquier escritor que no pase por `reserveRequestBudget`. Se prueba contra
// PostgreSQL real con SQL plano (sin pasar por la función de reserva).
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../src/db.js';
import { sources } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `monthly-source-${randomUUID()}`, name: 'Fuente mensual', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

interface RowOverrides {
  readonly month?: string;
  readonly totalCap?: number;
  readonly reserve?: number;
  readonly search?: number;
  readonly batch?: number;
  readonly onDemand?: number;
  readonly refresh?: number;
  readonly token?: number;
}

function insertRow(db: Database, sourceId: string, o: RowOverrides = {}): Promise<unknown> {
  return db.execute(sql`
    insert into monthly_request_budget
      (month, source_id, total_cap, reserve, search_requests, batch_requests, on_demand_requests, refresh_requests, token_requests)
    values (${o.month ?? '2026-10-01'}::date, ${sourceId}, ${o.totalCap ?? 100}, ${o.reserve ?? 30},
            ${o.search ?? 0}, ${o.batch ?? 0}, ${o.onDemand ?? 0}, ${o.refresh ?? 0}, ${o.token ?? 0})
  `);
}

describeWithDb('monthly_request_budget — CHECK estructurales y clave (decisión 248, D4)', () => {
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

  it('una fila coherente se inserta y los contadores arrancan en 0 por defecto', async () => {
    const sourceId = await insertSource(db);

    await db.execute(sql`
      insert into monthly_request_budget (month, source_id, total_cap, reserve)
      values ('2026-10-01'::date, ${sourceId}, 100, 30)
    `);

    const { rows } = await db.execute<Record<string, number | string>>(sql`
      select search_requests, batch_requests, on_demand_requests, refresh_requests, token_requests, month::text as month
      from monthly_request_budget
    `);
    expect(rows).toEqual([
      {
        search_requests: 0,
        batch_requests: 0,
        on_demand_requests: 0,
        refresh_requests: 0,
        token_requests: 0,
        month: '2026-10-01',
      },
    ]);
  });

  it('reserva 0 es válida (y total 1 con reserva 0): la regla es 0 <= reserva < total', async () => {
    const sourceId = await insertSource(db);

    await expect(insertRow(db, sourceId, { totalCap: 100, reserve: 0 })).resolves.toBeDefined();
    await expect(insertRow(db, sourceId, { month: '2026-11-01', totalCap: 1, reserve: 0 })).resolves.toBeDefined();
  });

  it.each<[string, RowOverrides]>([
    ['total 0', { totalCap: 0, reserve: 0 }],
    ['total negativo', { totalCap: -5, reserve: 0 }],
    ['reserva igual al total', { totalCap: 100, reserve: 100 }],
    ['reserva mayor que el total', { totalCap: 100, reserve: 150 }],
    ['reserva negativa', { totalCap: 100, reserve: -1 }],
    ['search_requests distinto de batch + on_demand + refresh', { search: 5, batch: 2, onDemand: 1, refresh: 1 }],
    ['search_requests por encima del total', { totalCap: 100, search: 101, batch: 101 }],
    ['contador de carril negativo (con la suma cuadrando)', { search: 0, batch: -1, onDemand: 1, refresh: 0 }],
    ['token_requests negativo', { token: -1 }],
  ])('CHECK: %s se rechaza con check_violation (23514)', async (_name, overrides) => {
    const sourceId = await insertSource(db);

    await expect(insertRow(db, sourceId, overrides)).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('el desglose por carril que SÍ cuadra con search_requests se acepta (3 + 2 + 1 = 6)', async () => {
    const sourceId = await insertSource(db);

    await expect(insertRow(db, sourceId, { search: 6, batch: 3, onDemand: 2, refresh: 1 })).resolves.toBeDefined();
  });

  it('PK (month, source_id): un segundo registro del mismo mes y fuente es unique_violation (23505), otro mes u otra fuente no', async () => {
    const sourceA = await insertSource(db);
    const sourceB = await insertSource(db);
    await insertRow(db, sourceA);

    await expect(insertRow(db, sourceA)).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(insertRow(db, sourceA, { month: '2026-11-01' })).resolves.toBeDefined();
    await expect(insertRow(db, sourceB)).resolves.toBeDefined();
  });

  it('la fuente debe existir (clave foránea, 23503)', async () => {
    await expect(insertRow(db, randomUUID())).rejects.toMatchObject({ cause: { code: '23503' } });
  });
});

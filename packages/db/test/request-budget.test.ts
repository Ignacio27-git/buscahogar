// ROADMAP 3.3 (decisión 248; R6, R7, R8, R14; diseño D4b, D5, D6, D6b, D7) —
// `reserveRequestBudget`: UNA transacción que materializa el mes (herencia), aplica el
// techo mensual por carril con bloqueo de fila y, para los carriles del worker, la
// reserva diaria; una denegación diaria revierte el paso mensual. Contra PostgreSQL
// real. Ninguna llamada de red.
import { randomUUID } from 'node:crypto';

import { monthlyGrant } from '@buscahogar/core';
import type { QuotaLane } from '@buscahogar/core';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reconcileRequestBudget, reserveRequestBudget } from '../src/budget-ledger.js';
import type { RequestBudgetResult } from '../src/budget-ledger.js';
import { createDb } from '../src/db.js';
import type { Database } from '../src/db.js';
import { sources } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

// Tope diario holgado: aísla el paso mensual en los tests que no hablan del diario.
const DAILY_AMPLE = { cap: 100_000 } as const;

async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `ledger-source-${randomUUID()}`, name: 'Fuente del registro', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

interface Quota {
  // 'current' = mes UTC en curso; un entero N = hace N meses.
  readonly monthsAgo?: number;
  readonly totalCap: number;
  readonly reserve: number;
  readonly batch?: number;
  readonly onDemand?: number;
  readonly refresh?: number;
}

async function seedQuota(db: Database, sourceId: string, quota: Quota): Promise<void> {
  const batch = quota.batch ?? 0;
  const onDemand = quota.onDemand ?? 0;
  const refresh = quota.refresh ?? 0;
  await db.execute(sql`
    insert into monthly_request_budget
      (month, source_id, total_cap, reserve, search_requests, batch_requests, on_demand_requests, refresh_requests)
    values (
      (date_trunc('month', now() at time zone 'utc') - (${quota.monthsAgo ?? 0}::integer * interval '1 month'))::date,
      ${sourceId}, ${quota.totalCap}, ${quota.reserve}, ${batch + onDemand + refresh}, ${batch}, ${onDemand}, ${refresh}
    )
  `);
}

interface MonthlyRow extends Record<string, unknown> {
  readonly month: string;
  readonly total_cap: number;
  readonly reserve: number;
  readonly search_requests: number;
  readonly batch_requests: number;
  readonly on_demand_requests: number;
  readonly refresh_requests: number;
  readonly token_requests: number;
}

// Filas del registro mensual, la del mes en curso primero (`ago` = 0).
async function monthlyRows(db: Database): Promise<(MonthlyRow & { readonly ago: number })[]> {
  const { rows } = await db.execute<MonthlyRow & { ago: number }>(sql`
    select month::text as month, total_cap, reserve, search_requests, batch_requests, on_demand_requests,
           refresh_requests, token_requests,
           (extract(year from age(date_trunc('month', now() at time zone 'utc'), month)) * 12
            + extract(month from age(date_trunc('month', now() at time zone 'utc'), month)))::integer as ago
    from monthly_request_budget order by month desc
  `);
  return rows;
}

async function currentRow(db: Database): Promise<MonthlyRow> {
  const row = (await monthlyRows(db)).find((candidate) => candidate.ago === 0);
  if (!row) {
    throw new Error('No hay fila del mes en curso');
  }
  return row;
}

async function dailySearchRequests(db: Database): Promise<number> {
  const { rows } = await db.execute<{ total: number }>(
    sql`select coalesce(sum(search_requests), 0)::integer as total from daily_request_budget`
  );
  return rows[0]?.total ?? 0;
}

function granted(result: RequestBudgetResult): number {
  return result.granted ? result.searchGranted : 0;
}

describeWithDb('reserveRequestBudget — registro mensual, herencia y carriles (decisión 248)', () => {
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

  describe('persistencia y herencia (R6, D4b)', () => {
    it('S6.1: el gasto y su desglose por carril sobreviven a un reinicio (conexión nueva)', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 7, tokenReserved: 1 });
      expect(result).toMatchObject({ granted: true, searchGranted: 7 });

      // "Reinicio": otra conexión, otro pool, mismo servidor.
      const { db: reconnected, pool: secondPool } = createDb(process.env.DATABASE_URL ?? '');
      try {
        const row = await currentRow(reconnected);
        expect(row).toMatchObject({
          search_requests: 7,
          batch_requests: 7,
          on_demand_requests: 0,
          refresh_requests: 0,
          token_requests: 1,
        });
      } finally {
        await secondPool.end();
      }
    });

    it('S6.2: un mes nuevo hereda total y reserva del mes anterior, con el gasto en 0', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 1, totalCap: 100, reserve: 30, batch: 60, onDemand: 5 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);

      expect(result).toMatchObject({ granted: true, searchGranted: 1 });
      const rows = await monthlyRows(db);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.ago === 0)).toMatchObject({
        total_cap: 100,
        reserve: 30,
        search_requests: 1,
        batch_requests: 0,
        on_demand_requests: 1,
        refresh_requests: 0,
      });
      // El mes anterior queda tal cual (histórico).
      expect(rows.find((row) => row.ago === 1)).toMatchObject({ search_requests: 65, batch_requests: 60, on_demand_requests: 5 });
    });

    it('hereda de la fila MÁS RECIENTE aunque haya meses anteriores más antiguos con otras cifras', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 3, totalCap: 50, reserve: 10 });
      await seedQuota(db, sourceId, { monthsAgo: 2, totalCap: 120, reserve: 40 });

      await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 2, tokenReserved: 0 });

      expect(await currentRow(db)).toMatchObject({ total_cap: 120, reserve: 40, search_requests: 2 });
    });

    it('no toca un mes en curso que ya existe: sus cifras mandan sobre las del mes anterior', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 1, totalCap: 500, reserve: 100 });
      await seedQuota(db, sourceId, { totalCap: 80, reserve: 20 });

      await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 1, tokenReserved: 0 });

      expect(await currentRow(db)).toMatchObject({ total_cap: 80, reserve: 20, search_requests: 1 });
    });

    it('S6.3/S14.4: sin fila en ningún mes se deniega con monthly-missing en CADA carril y no se escribe nada', async () => {
      const sourceId = await insertSource(db);

      for (const lane of ['batch', 'on-demand', 'refresh'] as const) {
        const result = await reserveRequestBudget(db, sourceId, { lane, searchRequested: 1, tokenReserved: 1 }, DAILY_AMPLE);
        expect(result).toEqual({ granted: false, reason: 'monthly-missing' });
      }

      expect(await monthlyRows(db)).toHaveLength(0);
      expect(await dailySearchRequests(db)).toBe(0);
    });

    it('la herencia es por fuente: la fila de otra fuente no sirve de plantilla', async () => {
      const sourceA = await insertSource(db);
      const sourceB = await insertSource(db);
      await seedQuota(db, sourceA, { monthsAgo: 1, totalCap: 100, reserve: 30 });

      const result = await reserveRequestBudget(db, sourceB, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);

      expect(result).toEqual({ granted: false, reason: 'monthly-missing' });
      expect(await monthlyRows(db)).toHaveLength(1);
    });

    it('dos primeras reservas CONCURRENTES del mes nuevo: una sola fila heredada y las dos se contabilizan', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 1, totalCap: 100, reserve: 30 });

      const results = await Promise.all([
        reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 3, tokenReserved: 0 }, DAILY_AMPLE),
        reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 4, tokenReserved: 0 }),
      ]);

      expect(results.every((result) => result.granted)).toBe(true);
      const rows = await monthlyRows(db);
      expect(rows.filter((row) => row.ago === 0)).toHaveLength(1);
      expect(await currentRow(db)).toMatchObject({
        total_cap: 100,
        reserve: 30,
        search_requests: 7,
        on_demand_requests: 3,
        batch_requests: 4,
      });
    });
  });

  describe('techo por carril (R7, R8, D5, D6b)', () => {
    it('D6b/S4.2: el batch pide 10 con 3 de margen y recibe 3 (concesión parcial), y el contador queda en total - reserva', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 67 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 10, tokenReserved: 1 });

      expect(result).toMatchObject({ granted: true, searchGranted: 3, lane: 'batch' });
      expect(await currentRow(db)).toMatchObject({ search_requests: 70, batch_requests: 70, token_requests: 1 });
    });

    it('S7.1: el batch con total - reserva ya gastado se deniega (monthly) y no cambia la fila', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 1, tokenReserved: 1 });

      expect(result).toEqual({ granted: false, reason: 'monthly' });
      expect(await currentRow(db)).toMatchObject({ search_requests: 70, token_requests: 0 });
    });

    it('S7.2: en el mismo estado, on-demand SÍ entra en la reserva', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);

      expect(result).toMatchObject({ granted: true, searchGranted: 1 });
      expect(await currentRow(db)).toMatchObject({ search_requests: 71, on_demand_requests: 1, batch_requests: 70 });
    });

    it('S7.3: con el total agotado on-demand se deniega aunque el cupo diario sobre', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70, onDemand: 30 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);

      expect(result).toEqual({ granted: false, reason: 'monthly' });
      expect(await dailySearchRequests(db)).toBe(0);
    });

    it('S7.4: dos reservas batch concurrentes con 1 unidad de margen — exactamente una gana', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 69 });

      const results = await Promise.all([
        reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 1, tokenReserved: 0 }),
        reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 1, tokenReserved: 0 }),
      ]);

      expect(results.filter((result) => result.granted)).toHaveLength(1);
      expect(await currentRow(db)).toMatchObject({ search_requests: 70, batch_requests: 70 });
    });

    it('concurrencia con concesión parcial: dos batch de 5 con 6 de margen reparten 5 + 1, nunca pasan del techo', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 64 });

      const results = await Promise.all([
        reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 5, tokenReserved: 0 }),
        reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 5, tokenReserved: 0 }),
      ]);

      expect(results.map(granted).sort((a, b) => a - b)).toEqual([1, 5]);
      expect(await currentRow(db)).toMatchObject({ search_requests: 70, batch_requests: 70 });
    });

    it('S8.1: el gasto de refresco se refleja en el margen del batch', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 2, tokenReserved: 0 }, DAILY_AMPLE);
      const batch = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 100, tokenReserved: 0 });

      expect(granted(batch)).toBe(68);
      expect(await currentRow(db)).toMatchObject({ refresh_requests: 2, batch_requests: 68, search_requests: 70 });
    });

    it('S8.2: con el fondo agotado por el batch el refresco se deniega (la reserva no se toca) y on-demand sí pasa', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });

      const refresh = await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);
      const onDemand = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, DAILY_AMPLE);

      expect(refresh).toEqual({ granted: false, reason: 'monthly' });
      expect(onDemand).toMatchObject({ granted: true });
      expect(await currentRow(db)).toMatchObject({ refresh_requests: 0, on_demand_requests: 1 });
    });

    it('S8.3: la verificación de presencia (carril refresco) cuenta en el mismo fondo que el batch', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      // Dos lotes de presencia de una petición cada uno: reservan en el carril de refresco.
      await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 2, tokenReserved: 1 }, DAILY_AMPLE);
      const batch = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 69, tokenReserved: 0 });

      expect(granted(batch)).toBe(68); // 70 - 2 de presencia
      expect(await currentRow(db)).toMatchObject({ refresh_requests: 2, token_requests: 1 });
    });

    it('el refresco es EXACTO (todo o nada): pide 4 con 3 de margen y no recibe nada; el batch con el mismo margen recibe 3', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 67 });

      expect(await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 4, tokenReserved: 0 }, DAILY_AMPLE)).toEqual({
        granted: false,
        reason: 'monthly',
      });
      expect(granted(await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 4, tokenReserved: 0 }))).toBe(3);
    });
  });

  describe('paridad SQL y regla pura de packages/core (mismos casos)', () => {
    interface ParityCase {
      readonly name: string;
      readonly lane: QuotaLane;
      readonly requested: number;
      readonly spent: number;
      readonly expectedGrant: number;
    }

    const PARITY_CASES: readonly ParityCase[] = [
      { name: 'S7.1 batch con 70 gastados', lane: 'batch', requested: 1, spent: 70, expectedGrant: 0 },
      { name: 'S7.2 on-demand con 70 gastados', lane: 'on-demand', requested: 1, spent: 70, expectedGrant: 1 },
      { name: 'S7.3 on-demand con 100 gastados', lane: 'on-demand', requested: 1, spent: 100, expectedGrant: 0 },
      { name: 'D6b/S4.2 batch pide 10 con 3 de margen', lane: 'batch', requested: 10, spent: 67, expectedGrant: 3 },
      { name: 'batch pide exactamente lo que queda', lane: 'batch', requested: 5, spent: 65, expectedGrant: 5 },
      { name: 'S8.2 refresco con el fondo agotado', lane: 'refresh', requested: 1, spent: 70, expectedGrant: 0 },
      { name: 'refresco pide 4 con 3 de margen', lane: 'refresh', requested: 4, spent: 67, expectedGrant: 0 },
      { name: 'refresco pide 3 con 3 de margen', lane: 'refresh', requested: 3, spent: 67, expectedGrant: 3 },
      { name: 'on-demand pide 5 con 3 de margen total', lane: 'on-demand', requested: 5, spent: 97, expectedGrant: 0 },
    ];

    it.each(PARITY_CASES)('$name', async ({ lane, requested, spent, expectedGrant }) => {
      const sourceId = await insertSource(db);
      // El gasto previo se siembra en el carril on-demand cuando supera total - reserva (no se podría en batch).
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, ...(spent > 70 ? { onDemand: spent - 70, batch: 70 } : { batch: spent }) });

      const result = await reserveRequestBudget(db, sourceId, { lane, searchRequested: requested, tokenReserved: 0 }, DAILY_AMPLE);

      expect(granted(result)).toBe(expectedGrant);
      // La regla pura de core da la misma cifra con los mismos datos.
      expect(monthlyGrant(lane, requested, { totalCap: 100, reserve: 30, searchRequests: spent })).toBe(expectedGrant);
    });
  });

  describe('reserva diaria y atomicidad (D6, D7, R14)', () => {
    it('un rechazo DIARIO revierte el paso mensual, incluida la fila heredada del mes nuevo', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 1, totalCap: 100, reserve: 30 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 6, tokenReserved: 1 }, { cap: 5 });

      expect(result).toEqual({ granted: false, reason: 'daily' });
      const rows = await monthlyRows(db);
      expect(rows).toHaveLength(1); // la fila del mes en curso no quedó escrita
      expect(rows[0]?.ago).toBe(1);
      expect(await dailySearchRequests(db)).toBe(0);
    });

    it('un rechazo diario sobre un mes ya existente no deja gasto mensual (search, carril y token intactos)', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 3, tokenReserved: 1 }, { cap: 100, laneCeiling: 2 });

      expect(result).toEqual({ granted: false, reason: 'daily' });
      expect(await currentRow(db)).toMatchObject({ search_requests: 0, refresh_requests: 0, token_requests: 0 });
    });

    it('un reserva concedida registra el gasto mensual Y el diario a la vez', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 4, tokenReserved: 1 }, { cap: 50 });

      expect(result).toMatchObject({ granted: true, searchGranted: 4, tokenReserved: 1, lane: 'on-demand' });
      expect(await currentRow(db)).toMatchObject({ search_requests: 4, on_demand_requests: 4, token_requests: 1 });
      expect(await dailySearchRequests(db)).toBe(4);
    });

    it('S14.1: con el techo del batch en 0 y el total sin agotar, on-demand se ejecuta y gasta de la reserva', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 70 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 10, tokenReserved: 1 }, { cap: 500 });

      expect(result).toMatchObject({ granted: true, searchGranted: 10 });
      expect(await currentRow(db)).toMatchObject({ search_requests: 80, on_demand_requests: 10 });
    });

    it('S14.3: con el cupo diario agotado y el total sin agotar on-demand se deniega (daily)', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 10, tokenReserved: 0 }, { cap: 10 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 }, { cap: 10 });

      expect(result).toEqual({ granted: false, reason: 'daily' });
      expect(await currentRow(db)).toMatchObject({ search_requests: 10 });
    });

    it('D7: el batch reserva SOLO contra el mes — no toca el diario aunque su cupo esté agotado', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 5, tokenReserved: 0 }, { cap: 5 });

      const result = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 20, tokenReserved: 1 });

      expect(result).toMatchObject({ granted: true, searchGranted: 20 });
      expect(await dailySearchRequests(db)).toBe(5); // solo lo gastado a demanda
    });

    it('entrada inválida: una petición no entera o menor que 1, o un carril del worker sin tope diario, lanza (error de programación, nunca una concesión)', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      await expect(reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 0, tokenReserved: 0 })).rejects.toThrow(RangeError);
      await expect(reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 1.5, tokenReserved: 0 })).rejects.toThrow(RangeError);
      await expect(reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 1, tokenReserved: 0 })).rejects.toThrow(
        /tope diario/
      );
      expect(await currentRow(db)).toMatchObject({ search_requests: 0 });
    });
  });

  describe('reconciliación (D6) — usa el mes de la reserva', () => {
    it('devuelve al mes y al día lo reservado y no gastado, y al contador de SU carril', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      const reserved = await reserveRequestBudget(db, sourceId, { lane: 'on-demand', searchRequested: 10, tokenReserved: 1 }, { cap: 100 });
      if (!reserved.granted) {
        throw new Error('la reserva debía concederse');
      }

      await reconcileRequestBudget(db, sourceId, reserved, { search: 4, token: 1 });

      expect(await currentRow(db)).toMatchObject({ search_requests: 4, on_demand_requests: 4, token_requests: 1 });
      expect(await dailySearchRequests(db)).toBe(4);
    });

    it('con una reserva batch parcial reconcilia sobre lo CONCEDIDO (3), no sobre lo pedido (10)', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 67 });
      const reserved = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 10, tokenReserved: 1 });
      if (!reserved.granted) {
        throw new Error('la reserva debía concederse');
      }

      await reconcileRequestBudget(db, sourceId, reserved, { search: 1, token: 1 });

      expect(await currentRow(db)).toMatchObject({ search_requests: 68, batch_requests: 68 });
    });

    it('usa el MES guardado en la reserva, no el mes en curso: un tick que cruza el cambio de mes devuelve al mes correcto', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { monthsAgo: 1, totalCap: 100, reserve: 30, batch: 10 });
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30, batch: 10 });
      const rows = await monthlyRows(db);
      const previousMonth = rows.find((row) => row.ago === 1)?.month;
      if (previousMonth === undefined) {
        throw new Error('falta el mes anterior');
      }

      await reconcileRequestBudget(
        db,
        sourceId,
        { granted: true, month: previousMonth, lane: 'batch', searchGranted: 10, tokenReserved: 0 },
        { search: 6, token: 0 }
      );

      const after = await monthlyRows(db);
      expect(after.find((row) => row.ago === 1)).toMatchObject({ search_requests: 6, batch_requests: 6 });
      expect(after.find((row) => row.ago === 0)).toMatchObject({ search_requests: 10, batch_requests: 10 });
    });

    it('si el proceso muere antes de reconciliar, la reserva se conserva: sobre-cuenta, nunca sub-cuenta', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });

      await reserveRequestBudget(db, sourceId, { lane: 'refresh', searchRequested: 10, tokenReserved: 1 }, DAILY_AMPLE);
      // (sin reconciliación: el proceso murió)

      expect(await currentRow(db)).toMatchObject({ search_requests: 10, refresh_requests: 10, token_requests: 1 });
      expect(await dailySearchRequests(db)).toBe(10);
    });

    it('gasto real igual a lo reservado: no cambia nada', async () => {
      const sourceId = await insertSource(db);
      await seedQuota(db, sourceId, { totalCap: 100, reserve: 30 });
      const reserved = await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 5, tokenReserved: 1 });
      if (!reserved.granted) {
        throw new Error('la reserva debía concederse');
      }

      await reconcileRequestBudget(db, sourceId, reserved, { search: 5, token: 1 });

      expect(await currentRow(db)).toMatchObject({ search_requests: 5, token_requests: 1 });
    });
  });
});

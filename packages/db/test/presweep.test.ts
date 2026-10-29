// ROADMAP 3.3 (decisión 253; R2, R5, R16; D13) — consultas de lectura del presweep:
// - `selectPresweepCandidates`: las N ciudades con más población conocida y geometría barrible, con el
//   estado de sus dos unidades (venta/alquiler) según su job de cobertura. Determinista.
// - `readMonthlyLedgerState`: lectura SOLO de lectura del registro mensual (mes en curso o heredado), que
//   permite al presweep decidir antes de gastar nada.
// PostgreSQL real, sin red.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { readMonthlyLedgerState, reserveRequestBudget, setMonthlyQuota } from '../src/budget-ledger.js';
import type { Database } from '../src/db.js';
import { selectPresweepCandidates } from '../src/presweep.js';
import { coverageJobs, sources, zones } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `presweep-${randomUUID()}`, name: 'Fuente del presweep', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

interface SeedCity {
  readonly ineCode: string;
  readonly population: number | null;
  readonly withCentroid?: boolean;
}

// Inserta localización + zona; el centroide se escribe con SQL (tipo geography) y la geometría completa
// (centroide + radio) solo si `withCentroid !== false`.
async function insertCity(db: Database, city: SeedCity): Promise<string> {
  const barrible = city.withCentroid !== false;
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into locations (ine_code, municipality, province, province_code, autonomous_community, search_name, population, centroid, sweep_radius_m)
    values (
      ${city.ineCode}, ${`Ciudad ${city.ineCode}`}, 'Provincia', ${city.ineCode.slice(0, 2)}, 'Comunidad', ${`ciudad ${city.ineCode}`},
      ${city.population},
      ${barrible ? sql`ST_SetSRID(ST_MakePoint(-3.6, 37.17), 4326)::geography` : sql`null`},
      ${barrible ? 4500 : null}
    )
    returning id
  `);
  const locationId = rows[0]?.id;
  if (!locationId) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

describeWithDb('selectPresweepCandidates — top-N por población (decisión 253, R2)', () => {
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

  it('devuelve las N mayores por población DESC; el desempate es el código INE ASC', async () => {
    const sourceId = await insertSource(db);
    await insertCity(db, { ineCode: '41091', population: 500 });
    await insertCity(db, { ineCode: '08019', population: 500 });
    await insertCity(db, { ineCode: '28079', population: 900 });
    await insertCity(db, { ineCode: '18087', population: 100 });

    const rows = await selectPresweepCandidates(db, { sourceId, top: 3 });

    expect(rows.map((row) => [row.ineCode, row.population])).toEqual([
      ['28079', 900],
      ['08019', 500],
      ['41091', 500],
    ]);
  });

  it('es determinista: dos ejecuciones seguidas devuelven exactamente lo mismo', async () => {
    const sourceId = await insertSource(db);
    for (const ineCode of ['11001', '11002', '11003', '11004']) {
      await insertCity(db, { ineCode, population: 777 });
    }

    const first = await selectPresweepCandidates(db, { sourceId, top: 3 });
    const second = await selectPresweepCandidates(db, { sourceId, top: 3 });

    expect(first.map((row) => row.ineCode)).toEqual(['11001', '11002', '11003']);
    expect(second).toEqual(first);
  });

  it('excluye población desconocida (NULL) y localizaciones sin centroide o sin radio; con N mayor devuelve solo las válidas', async () => {
    const sourceId = await insertSource(db);
    await insertCity(db, { ineCode: '11001', population: null });
    await insertCity(db, { ineCode: '11002', population: 2_000_000, withCentroid: false });
    await insertCity(db, { ineCode: '11003', population: 50 });

    const rows = await selectPresweepCandidates(db, { sourceId, top: 100 });

    expect(rows.map((row) => row.ineCode)).toEqual(['11003']);
  });

  it('una ciudad sin ningún job tiene las dos unidades pendientes', async () => {
    const sourceId = await insertSource(db);
    await insertCity(db, { ineCode: '11001', population: 10 });

    const [row] = await selectPresweepCandidates(db, { sourceId, top: 1 });

    expect(row?.units).toEqual({ sale: 'pending', rent: 'pending' });
  });

  it('estado por operación: completada (last_completed_at), en curso (running) y parcial (pendiente con cursor)', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertCity(db, { ineCode: '11001', population: 10 });
    const otherZone = await insertCity(db, { ineCode: '11002', population: 9 });
    await db.insert(coverageJobs).values({
      zoneId,
      sourceId,
      operation: 'rent',
      status: 'done',
      lastCompletedAt: new Date('2026-09-01T00:00:00Z'),
    });
    await db.insert(coverageJobs).values({ zoneId, sourceId, operation: 'sale', status: 'running' });
    await db.insert(coverageJobs).values({
      zoneId: otherZone,
      sourceId,
      operation: 'sale',
      status: 'pending',
      cursor: 'opaque-cursor',
    });

    const rows = await selectPresweepCandidates(db, { sourceId, top: 2 });

    expect(rows.map((row) => [row.ineCode, row.units])).toEqual([
      ['11001', { sale: 'running', rent: 'completed' }],
      ['11002', { sale: 'pending', rent: 'pending' }],
    ]);
  });

  it('un job completado y re-encolado para refresco (pendiente con last_completed_at) sigue contando como completado', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertCity(db, { ineCode: '11001', population: 10 });
    await db.insert(coverageJobs).values({
      zoneId,
      sourceId,
      operation: 'sale',
      status: 'pending',
      refreshRequestedAt: new Date('2026-10-01T00:00:00Z'),
      lastCompletedAt: new Date('2026-09-01T00:00:00Z'),
    });

    const [row] = await selectPresweepCandidates(db, { sourceId, top: 1 });

    expect(row?.units.sale).toBe('completed');
  });

  it('los jobs de otra fuente no cuentan para la fuente consultada', async () => {
    const sourceId = await insertSource(db);
    const otherSourceId = await insertSource(db);
    const zoneId = await insertCity(db, { ineCode: '11001', population: 10 });
    await db.insert(coverageJobs).values({
      zoneId,
      sourceId: otherSourceId,
      operation: 'sale',
      status: 'done',
      lastCompletedAt: new Date('2026-09-01T00:00:00Z'),
    });

    const [row] = await selectPresweepCandidates(db, { sourceId, top: 1 });

    expect(row?.units.sale).toBe('pending');
  });

  it('devuelve el id de la zona (para reclamar el job) y el nombre del municipio', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertCity(db, { ineCode: '18087', population: 232462 });

    const [row] = await selectPresweepCandidates(db, { sourceId, top: 1 });

    expect(row).toMatchObject({ zoneId, ineCode: '18087', municipality: 'Ciudad 18087', population: 232462 });
  });

  it('top inválido (no entero o < 1) lanza RangeError y no consulta', async () => {
    const sourceId = await insertSource(db);
    await expect(selectPresweepCandidates(db, { sourceId, top: 0 })).rejects.toThrow(RangeError);
    await expect(selectPresweepCandidates(db, { sourceId, top: 1.5 })).rejects.toThrow(RangeError);
  });
});

describeWithDb('readMonthlyLedgerState — lectura sin efectos del registro mensual (decisión 253, D13)', () => {
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

  async function currentMonth(): Promise<string> {
    const { rows } = await db.execute<{ month: string }>(
      sql`select date_trunc('month', now() at time zone 'utc')::date::text as month`
    );
    return rows[0]?.month ?? '';
  }

  async function previousMonth(): Promise<string> {
    const { rows } = await db.execute<{ month: string }>(
      sql`select (date_trunc('month', now() at time zone 'utc') - interval '1 month')::date::text as month`
    );
    return rows[0]?.month ?? '';
  }

  async function ledgerRows(): Promise<number> {
    const { rows } = await db.execute<{ total: number }>(sql`select count(*)::integer as total from monthly_request_budget`);
    return rows[0]?.total ?? 0;
  }

  it('sin ninguna fila (ni en el mes ni en los anteriores) devuelve null y no escribe nada', async () => {
    const sourceId = await insertSource(db);

    expect(await readMonthlyLedgerState(db, sourceId)).toBeNull();
    expect(await ledgerRows()).toBe(0);
  });

  it('con fila del mes en curso devuelve total, reserva y gasto reales', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: await currentMonth(), totalCap: 100, reserve: 30 });
    await reserveRequestBudget(db, sourceId, { lane: 'batch', searchRequested: 12, tokenReserved: 0 });

    expect(await readMonthlyLedgerState(db, sourceId)).toEqual({ totalCap: 100, reserve: 30, searchRequests: 12 });
  });

  it('sin fila del mes en curso hereda total y reserva del mes anterior con gasto 0 y NO crea la fila', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: await previousMonth(), totalCap: 80, reserve: 20 });
    await db.execute(sql`update monthly_request_budget set search_requests = 40, batch_requests = 40 where source_id = ${sourceId}`);

    expect(await readMonthlyLedgerState(db, sourceId)).toEqual({ totalCap: 80, reserve: 20, searchRequests: 0 });
    expect(await ledgerRows()).toBe(1);
  });

  it('hereda del mes anterior MÁS RECIENTE cuando hay varios', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: '2020-01-01', totalCap: 10, reserve: 1 });
    await setMonthlyQuota(db, sourceId, { month: await previousMonth(), totalCap: 55, reserve: 5 });

    expect(await readMonthlyLedgerState(db, sourceId)).toEqual({ totalCap: 55, reserve: 5, searchRequests: 0 });
  });

  it('la fila del mes en curso manda sobre la heredable', async () => {
    const sourceId = await insertSource(db);
    await setMonthlyQuota(db, sourceId, { month: await previousMonth(), totalCap: 80, reserve: 20 });
    await setMonthlyQuota(db, sourceId, { month: await currentMonth(), totalCap: 200, reserve: 50 });

    expect(await readMonthlyLedgerState(db, sourceId)).toEqual({ totalCap: 200, reserve: 50, searchRequests: 0 });
  });

  it('solo mira la fuente consultada', async () => {
    const sourceId = await insertSource(db);
    const other = await insertSource(db);
    await setMonthlyQuota(db, other, { month: await currentMonth(), totalCap: 100, reserve: 30 });

    expect(await readMonthlyLedgerState(db, sourceId)).toBeNull();
  });
});

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102) — señal de demanda
// `zone_query_signals`: una fila por (zona, día UTC), escrita por la web con
// el rol INSERT-only, leída solo por el propietario de `apps/ingestion`.
// Se prueba contra PostgreSQL real: esquema, migración con backfill
// (S-QSR-9), inserción idempotente (S-QSR-1..3) y purga acotada (S-RP-19).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { purgeExpiredZoneQuerySignals, recordZoneQuerySignal } from '../../src/query-signals.js';
import { zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertLocation, insertSource } from '../helpers/fixtures.js';

async function insertZone(db: Database): Promise<string> {
  const locationId = await insertLocation(db);
  const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

async function signalDays(db: Database, zoneId: string): Promise<string[]> {
  const result = await db.execute<{ day: string }>(
    sql`select day::text as day from zone_query_signals where zone_id = ${zoneId} order by day`
  );
  return result.rows.map((row) => row.day);
}

// Sentencia de backfill de la migración 0013, leída del propio fichero SQL
// para probar la sentencia real y no una copia.
function readBackfillStatement(): string {
  const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const file = readdirSync(migrationsDir).find((name) => name.startsWith('0013_'));
  if (!file) {
    throw new Error('No existe la migración 0013');
  }
  const statement = readFileSync(`${migrationsDir}${file}`, 'utf8')
    .split('--> statement-breakpoint')
    .find((part) => /INSERT INTO "zone_query_signals"/i.test(part));
  if (!statement) {
    throw new Error('La migración 0013 no contiene el backfill de zone_query_signals');
  }
  return statement;
}

describeWithDb('zone_query_signals — esquema y registro idempotente (QSR-1, QSR-2, S-QSR-1..3)', () => {
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

  it('S-QSR-1: sin señal previa, registrar crea EXACTAMENTE una fila (zona, hoy UTC)', async () => {
    const zoneId = await insertZone(db);

    await recordZoneQuerySignal(db, zoneId);

    const today = await db.execute<{ today: string }>(sql`select (now() at time zone 'utc')::date::text as today`);
    expect(await signalDays(db, zoneId)).toEqual([today.rows[0]?.today]);
  });

  it('S-QSR-2: 50 registros más el mismo día no fallan, no crean filas ni actualizan la existente', async () => {
    const zoneId = await insertZone(db);
    await recordZoneQuerySignal(db, zoneId);

    for (let index = 0; index < 50; index += 1) {
      await recordZoneQuerySignal(db, zoneId);
    }

    const rows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from zone_query_signals where zone_id = ${zoneId}`
    );
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('S-QSR-3: una fila de AYER no impide registrar la de hoy — quedan dos filas', async () => {
    const zoneId = await insertZone(db);
    await db.execute(sql`
      insert into zone_query_signals (zone_id, day) values (${zoneId}, (now() at time zone 'utc')::date - 1)
    `);

    await recordZoneQuerySignal(db, zoneId);

    expect(await signalDays(db, zoneId)).toHaveLength(2);
  });

  it('QSR-1: la clave primaria (zone_id, day) rechaza un duplicado directo con unique_violation', async () => {
    const zoneId = await insertZone(db);
    await pool.query('insert into zone_query_signals (zone_id) values ($1)', [zoneId]);

    await expect(pool.query('insert into zone_query_signals (zone_id) values ($1)', [zoneId])).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('QSR-1: borrar la zona borra sus señales (ON DELETE CASCADE)', async () => {
    const zoneId = await insertZone(db);
    await recordZoneQuerySignal(db, zoneId);

    await pool.query('delete from zones where id = $1', [zoneId]);

    const rows = await db.execute<{ count: string }>(sql`select count(*)::text as count from zone_query_signals`);
    expect(rows.rows[0]?.count).toBe('0');
  });

  it('registrar sobre una zona inexistente rechaza con foreign_key_violation (nunca crea una fila huérfana)', async () => {
    await expect(recordZoneQuerySignal(db, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });
});

describeWithDb('migración 0013 — backfill de señales desde coverage_jobs (QSR-7, S-QSR-9)', () => {
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

  it('cada zona con job recibe una señal en la fecha UTC de requested_at, y solo esa', async () => {
    const sourceId = await insertSource(db);
    const zoneA = await insertZone(db);
    const zoneB = await insertZone(db);
    // Dos requested_at con fecha UTC distinta; el primero cerca de medianoche
    // UTC para comprobar que el día NO depende de la zona horaria de sesión.
    await pool.query(
      `insert into coverage_jobs (zone_id, source_id, status, requested_at) values
         ($1, $3, 'done', '2026-03-10 23:30:00+00'),
         ($2, $3, 'done', '2026-05-01 00:15:00+00')`,
      [zoneA, zoneB, sourceId]
    );

    await db.execute(sql.raw(readBackfillStatement()));

    expect(await signalDays(db, zoneA)).toEqual(['2026-03-10']);
    expect(await signalDays(db, zoneB)).toEqual(['2026-05-01']);
  });

  it('el backfill es idempotente: ejecutarlo dos veces no duplica ni falla', async () => {
    const sourceId = await insertSource(db);
    const zoneId = await insertZone(db);
    await pool.query(
      `insert into coverage_jobs (zone_id, source_id, requested_at) values ($1, $2, '2026-04-04 12:00:00+00')`,
      [zoneId, sourceId]
    );

    await db.execute(sql.raw(readBackfillStatement()));
    await db.execute(sql.raw(readBackfillStatement()));

    expect(await signalDays(db, zoneId)).toEqual(['2026-04-04']);
  });
});

describeWithDb('purgeExpiredZoneQuerySignals — purga acotada del propietario (RP-12, S-RP-19)', () => {
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

  async function seedSignalAge(zoneId: string, ageDays: number): Promise<void> {
    await db.execute(sql`
      insert into zone_query_signals (zone_id, day) values (${zoneId}, (now() at time zone 'utc')::date - ${ageDays}::integer)
    `);
  }

  it('borra las señales de 200 días y conserva la de hace 5 (S-RP-19)', async () => {
    const zoneId = await insertZone(db);
    await seedSignalAge(zoneId, 200);
    await seedSignalAge(zoneId, 250);
    await seedSignalAge(zoneId, 5);

    const deleted = await purgeExpiredZoneQuerySignals(db, { retentionDays: 180, maxRows: 100 });

    expect(deleted).toBe(2);
    expect(await signalDays(db, zoneId)).toHaveLength(1);
  });

  it('frontera: day < hoy - 180 — la de hace 181 días se borra, la de hace 180 se conserva', async () => {
    const zoneId = await insertZone(db);
    await seedSignalAge(zoneId, 181);
    await seedSignalAge(zoneId, 180);

    const deleted = await purgeExpiredZoneQuerySignals(db, { retentionDays: 180, maxRows: 100 });

    expect(deleted).toBe(1);
    const remaining = await db.execute<{ age: number }>(
      sql`select ((now() at time zone 'utc')::date - day)::integer as age from zone_query_signals`
    );
    expect(remaining.rows.map((row) => row.age)).toEqual([180]);
  });

  it('acotada por tick: con 5 señales caducadas y maxRows = 2 borra 2, y la siguiente pasada otras 2', async () => {
    const zoneId = await insertZone(db);
    for (const age of [200, 201, 202, 203, 204]) {
      await seedSignalAge(zoneId, age);
    }

    expect(await purgeExpiredZoneQuerySignals(db, { retentionDays: 180, maxRows: 2 })).toBe(2);
    expect(await purgeExpiredZoneQuerySignals(db, { retentionDays: 180, maxRows: 2 })).toBe(2);
    expect(await signalDays(db, zoneId)).toHaveLength(1);
  });

  it('sin señales caducadas no borra nada y devuelve 0', async () => {
    const zoneId = await insertZone(db);
    await seedSignalAge(zoneId, 10);

    expect(await purgeExpiredZoneQuerySignals(db, { retentionDays: 180, maxRows: 100 })).toBe(0);
    expect(await signalDays(db, zoneId)).toHaveLength(1);
  });
});

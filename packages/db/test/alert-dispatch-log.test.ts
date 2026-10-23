// ROADMAP 3.4 (decisión 259, D17; R7.3) — almacén duradero de la deduplicación de avisos: sobrevive al
// reinicio del worker porque vive en PostgreSQL. Lectura por claves, upsert y purga acotada.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import {
  ALERT_DISPATCH_LOG_PURGE_BATCH,
  purgeAlertDispatchLog,
  readAlertDispatchTimes,
  recordAlertDispatch,
} from '../src/alert-dispatch-log.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

describeWithDb('alert_dispatch_log — almacén de deduplicación (decisión 259)', () => {
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

  it('sin filas devuelve un mapa vacío; con lista de claves vacía no consulta nada', async () => {
    expect((await readAlertDispatchTimes(db, ['a', 'b'])).size).toBe(0);
    expect((await readAlertDispatchTimes(db, [])).size).toBe(0);
  });

  it('registra el instante y la lectura devuelve solo las claves pedidas', async () => {
    await recordAlertDispatch(db, 'quota-80:2026-10', new Date('2026-10-01T10:00:00.000Z'));
    await recordAlertDispatch(db, 'worker-started', new Date('2026-10-02T11:30:00.000Z'));

    const times = await readAlertDispatchTimes(db, ['quota-80:2026-10', 'otra']);

    expect([...times.keys()]).toEqual(['quota-80:2026-10']);
    expect(times.get('quota-80:2026-10')?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('volver a registrar la misma clave actualiza el instante sin duplicar la fila', async () => {
    await recordAlertDispatch(db, 'k', new Date('2026-10-01T00:00:00.000Z'));
    await recordAlertDispatch(db, 'k', new Date('2026-10-03T00:00:00.000Z'));

    const times = await readAlertDispatchTimes(db, ['k']);
    const count = await pool.query<{ count: string }>('select count(*) from alert_dispatch_log');

    expect(times.get('k')?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it('la purga borra solo filas anteriores al corte y devuelve cuántas', async () => {
    await recordAlertDispatch(db, 'vieja-1', new Date('2026-06-01T00:00:00.000Z'));
    await recordAlertDispatch(db, 'vieja-2', new Date('2026-06-02T00:00:00.000Z'));
    await recordAlertDispatch(db, 'reciente', new Date('2026-10-01T00:00:00.000Z'));

    const purged = await purgeAlertDispatchLog(db, new Date('2026-09-01T00:00:00.000Z'));

    expect(purged).toBe(2);
    expect([...(await readAlertDispatchTimes(db, ['vieja-1', 'vieja-2', 'reciente'])).keys()]).toEqual(['reciente']);
  });

  it('la purga está acotada: borra como mucho `limit` filas por pasada', async () => {
    await pool.query(
      `insert into alert_dispatch_log (dedup_key, last_sent_at)
       select 'k' || g, '2026-01-01T00:00:00Z' from generate_series(1, 5) g`
    );

    const purged = await purgeAlertDispatchLog(db, new Date('2026-09-01T00:00:00.000Z'), 3);

    expect(purged).toBe(3);
    const left = await pool.query<{ count: string }>('select count(*) from alert_dispatch_log');
    expect(Number(left.rows[0]?.count)).toBe(2);
    expect(ALERT_DISPATCH_LOG_PURGE_BATCH).toBe(100);
  });

  it('rechaza un límite de purga no positivo', async () => {
    await expect(purgeAlertDispatchLog(db, new Date(), 0)).rejects.toThrow(/limit/);
  });
});

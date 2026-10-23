// ROADMAP 3.4 (decisión 259, D17; R7.3) — almacén de la deduplicación DURADERA de avisos (`alert_dispatch_log`,
// migración 0022). Solo lo usa `apps/ingestion` (credencial de propietario); ningún rol web lo toca.
//
// El reloj lo aporta el llamador (`sentAt`/`olderThan`), igual que `proxy-rate-limit.ts`: la lógica de
// enfriamiento es pura (`packages/core`) y se prueba con instantes inyectados. Las claves son opacas.
import { sql } from 'drizzle-orm';
import type { Database } from './db.js';

// Filas que como máximo borra UNA pasada de purga (corte explícito: sin planificador ni bucle).
export const ALERT_DISPATCH_LOG_PURGE_BATCH = 100;

export async function readAlertDispatchTimes(db: Database, keys: readonly string[]): Promise<ReadonlyMap<string, Date>> {
  const times = new Map<string, Date>();
  if (keys.length === 0) {
    return times;
  }
  const { rows } = await db.execute<{ dedup_key: string; last_sent_at: Date | string }>(sql`
    select dedup_key, last_sent_at from alert_dispatch_log
    where dedup_key in (${sql.join(
      keys.map((key) => sql`${key}`),
      sql`, `
    )})
  `);
  for (const row of rows) {
    times.set(row.dedup_key, new Date(row.last_sent_at));
  }
  return times;
}

export async function recordAlertDispatch(db: Database, key: string, sentAt: Date): Promise<void> {
  await db.execute(sql`
    insert into alert_dispatch_log (dedup_key, last_sent_at)
    values (${key}, ${sentAt.toISOString()}::timestamptz)
    on conflict (dedup_key) do update set last_sent_at = excluded.last_sent_at
  `);
}

// Borra como mucho `limit` filas anteriores a `olderThan` (las más antiguas primero) y devuelve cuántas. Las
// claves llevan día o mes, así que la tabla crece unas pocas filas al día: la purga solo evita el crecimiento
// indefinido.
export async function purgeAlertDispatchLog(
  db: Database,
  olderThan: Date,
  limit: number = ALERT_DISPATCH_LOG_PURGE_BATCH
): Promise<number> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('purgeAlertDispatchLog: limit debe ser un entero positivo.');
  }
  const { rows } = await db.execute<{ dedup_key: string }>(sql`
    delete from alert_dispatch_log
    where dedup_key in (
      select dedup_key from alert_dispatch_log
      where last_sent_at < ${olderThan.toISOString()}::timestamptz
      order by last_sent_at
      limit ${limit}
      for update skip locked
    )
    returning dedup_key
  `);
  return rows.length;
}

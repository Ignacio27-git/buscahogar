// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102) — señal de demanda
// `zone_query_signals`. Dos operaciones con dueños distintos:
//
// - `recordZoneQuerySignal`: la usa `apps/web` con el rol `web_coverage`, que
//   tiene INSERT y nada más sobre la tabla. Inserta SOLO `zone_id` con `ON
//   CONFLICT DO NOTHING`: sin cláusula `WHERE`, sin `RETURNING` y sin `DO
//   UPDATE`, así que PostgreSQL no exige SELECT ni UPDATE (lo demuestra el
//   test de privilegios del rol). `day` lo fija el DEFAULT con el reloj de
//   Postgres.
// - `purgeExpiredZoneQuerySignals`: la usa el propietario (`apps/ingestion`)
//   en el mantenimiento del worker, acotada por tick (RP-12).
//
// Zod-free y sin `process.env`, como el resto de `packages/db`.
import { sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { zoneQuerySignals } from './tables.js';
import { utcDayStart } from './time.js';

export async function recordZoneQuerySignal(db: Database, zoneId: string): Promise<void> {
  await db.insert(zoneQuerySignals).values({ zoneId }).onConflictDoNothing();
}

export interface SignalPurgeOptions {
  // Una señal caduca cuando `day < hoy - retentionDays` (RP-12).
  readonly retentionDays: number;
  // Tope de filas por llamada: la purga de un tick nunca es ilimitada.
  readonly maxRows: number;
}

// Devuelve el número de filas borradas. El tope se aplica seleccionando por
// `ctid` con `LIMIT` (la tabla no tiene columna sustituta) y borrando esas
// filas; una purga concurrente solo puede dejar menos filas borradas, nunca
// más que `maxRows`.
export async function purgeExpiredZoneQuerySignals(db: Database, options: SignalPurgeOptions): Promise<number> {
  const result = await db.execute(sql`
    delete from zone_query_signals
    where ctid in (
      select ctid from zone_query_signals
      where day < (${utcDayStart()})::date - ${options.retentionDays}::integer
      limit ${options.maxRows}::integer
    )
  `);
  return result.rowCount ?? 0;
}

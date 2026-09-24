// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage
// Limit...", diseño decisión 076/077) — tope diario POR CLIENTE del
// registro de nuevos `coverage_jobs`, independiente del ledger GLOBAL
// (`budget-ledger.ts`, DD-12). Zod-free (decisión 023) y crypto-free por el
// mismo principio: `key_hash` llega YA resuelto (HMAC-SHA256 hex, calculado
// en `apps/web/src/server/client-identity.ts`, PR2) — este módulo nunca ve
// ni deriva la identidad cruda del cliente, solo la almacena de forma
// opaca.
//
// El día SIEMPRE se calcula con el reloj del propio Postgres (DD-11, mismo
// principio que `budget-ledger.ts::todaySql`), nunca con el del proceso
// Node que llama — así el worker de `apps/ingestion` (purga programada, D9)
// y las escrituras desde `apps/web` comparten siempre el mismo instante de
// referencia.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db.js';
import { utcDayStart } from './time.js';

function todaySql(): SQL {
  return sql`(${utcDayStart()})::date`;
}

// Purga las filas de ventana YA CERRADA (day < hoy). Reutilizable en dos
// sitios (D9, decisión de diseño #263): internamente, como parte del propio
// camino de escritura de `consumeClientQuota` (decisión 076 — "no retenida
// indefinidamente, no diferida a un pase programado aparte"), Y de forma
// directa por la purga programada del ciclo periódico de `apps/ingestion`
// (D9 — supersede la cláusula original de la spec #261 "not a separate
// scheduled pass": D9 añade la purga programada COMO REFUERZO del acotado
// de retención, no la sustituye). Devuelve el número de filas borradas —
// nunca lanza salvo un fallo genuino de base de datos (mismo idioma
// fail-closed que `reserveDailyBudget`).
export async function purgeExpiredClientQuota(db: Database): Promise<number> {
  const result = await db.execute(sql`
    delete from coverage_client_quota where day < ${todaySql()}
  `);
  return result.rowCount ?? 0;
}

// UPSERT atómico de una sola sentencia (decisión 077, mismo idioma que
// `reserveDailyBudget`/DD-12): el `WHERE` del `SELECT` fuente respeta el
// tope en la PRIMERA consumición del día para esta clave, y el `WHERE` del
// `ON CONFLICT ... DO UPDATE` lo respeta en cualquier consumición
// posterior — ninguna de las dos ramas tiene un hueco de
// lectura-modificación-escritura entre procesos concurrentes. Cero filas
// devueltas (`RETURNING`) ⇒ la consumición habría superado el tope ⇒
// rechazada, el contador NO se incrementa.
export async function consumeClientQuota(db: Database, keyHash: string, dailyCap: number): Promise<boolean> {
  // Purga ANTES de la propia escritura (decisión 076): cualquier consumición
  // de CUALQUIER cliente es la oportunidad de purgar ventanas ya cerradas,
  // no solo la de la clave que se está consumiendo ahora mismo.
  await purgeExpiredClientQuota(db);

  const result = await db.execute<{ registrations: number }>(sql`
    insert into coverage_client_quota (key_hash, day, registrations)
    select ${keyHash}, ${todaySql()}, 1
    where 1::integer <= ${dailyCap}::integer
    on conflict (key_hash, day) do update
      set registrations = coverage_client_quota.registrations + 1
      where coverage_client_quota.registrations + 1 <= ${dailyCap}::integer
    returning registrations
  `);

  return result.rows.length > 0;
}

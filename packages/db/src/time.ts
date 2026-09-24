// ROADMAP 1.13 (diseño DD-11) — ÚNICA definición de "hoy" para todo el
// cambio: día natural UTC, nunca hora local ni ventana móvil de 24h.
// Consumida por el ledger de presupuesto (`budget-ledger.ts`, DD-12) y por
// el contador de zonas nuevas del día (Unit D, `coverage.ts`, DD-14) — un
// único punto de expresión, mismo idioma que decisión 019
// (`spatial.ts:1-4`): si la definición cambiara, el cambio queda confinado
// al cuerpo de esta función.
//
// Delega en el propio reloj de PostgreSQL (`now()`), nunca en el del
// proceso Node: así el ledger (que escribe, desde el proceso worker) y las
// consultas de lectura (desde `apps/web`) comparten siempre el mismo
// instante de referencia, sin depender de que dos procesos distintos
// tengan el reloj del sistema sincronizado entre sí.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export function utcDayStart(): SQL {
  return sql`date_trunc('day', now() at time zone 'utc')`;
}

// ROADMAP 3.4 (decisión 255, D2) — contadores del limitador de peticiones COMPARTIDO por todas las
// instancias de `apps/web` (enmienda la 074, que lo mantenía en memoria por proceso). Una fila por
// clave: `key_hash` es siempre el HMAC-SHA256 de la identidad del cliente (decisión 076), nunca la IP
// en claro; `window_start_ms` es el inicio de la ventana fija en milisegundos Unix (lo aporta el
// llamador, para que la lógica sea la misma que la del núcleo y se pueda probar con un reloj
// inyectado); `hits` es el contador, acotado a `max + 1` por `proxy-rate-limit.ts`.
//
// PRIVILEGIOS (R1.5, D5b): `web_coverage` recibe exactamente SELECT/INSERT/UPDATE/DELETE; `web_readonly`
// NO debe tocarla. Los privilegios por defecto del bootstrap le concederían SELECT, así que la
// migración 0020 y `sql/bootstrap-roles-grants.sql` hacen un REVOKE explícito (patrón de la 0019).
import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const proxyRateLimit = pgTable(
  'proxy_rate_limit',
  {
    keyHash: text('key_hash').primaryKey(),
    windowStartMs: bigint('window_start_ms', { mode: 'number' }).notNull(),
    hits: integer('hits').notNull(),
  },
  (table) => [
    check('proxy_rate_limit_hits_check', sql`${table.hits} >= 1`),
    index('proxy_rate_limit_window_start_ms_idx').on(table.windowStartMs),
  ]
);

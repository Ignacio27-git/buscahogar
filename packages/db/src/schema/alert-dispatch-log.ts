// ROADMAP 3.4 (decisión 259, D17; R7.3) — deduplicación DURADERA de los avisos operativos de Telegram. Una fila
// por clave de aviso (`quota-80:2026-10`, `stale-reclaim:2026-10-22`, `worker-started`...) con el instante del
// último envío: sobrevive al reinicio del worker, así que un reinicio dentro del enfriamiento no reenvía.
// Los reintentos tras un fallo de Telegram NO se registran (solo se anota lo realmente enviado).
//
// PRIVILEGIOS: tabla SOLO del propietario (`apps/ingestion`). Ni `web_readonly` ni `web_coverage` pueden
// tocarla; los privilegios por defecto del bootstrap le darían SELECT a `web_readonly`, así que la migración
// 0022 y el bloque final de `sql/bootstrap-roles-grants.sql` hacen un REVOKE explícito (patrón de la 0019).
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const alertDispatchLog = pgTable(
  'alert_dispatch_log',
  {
    dedupKey: text('dedup_key').primaryKey(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('alert_dispatch_log_last_sent_at_idx').on(table.lastSentAt)]
);

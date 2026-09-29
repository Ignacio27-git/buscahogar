// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102) — señal de demanda
// por zona: una fila por (zona, día UTC) cada vez que un usuario busca sobre
// una zona resuelta. Es lo que decide la cadencia de refresco y la purga
// (`packages/core/src/retention`): mide interés real, no oferta.
//
// Clave primaria compuesta `(zone_id, day)`, sin columna sustituta: la propia
// clave es la garantía de unicidad que necesita el `INSERT ... ON CONFLICT DO
// NOTHING` de la web (mismo idioma que `coverage_client_quota`). `apps/web`
// inserta SOLO `zone_id` con el rol `web_coverage` (GRANT INSERT únicamente,
// bootstrap-roles-grants.sql): `day` lo rellena el DEFAULT con el reloj de
// Postgres, nunca el del proceso Node. La lectura es exclusiva del
// propietario (`apps/ingestion`).
//
// `ON DELETE CASCADE`: borrar una zona borra sus señales. (La purga de zona
// nunca borra la fila de `zones`, que es el catálogo INE sembrado; borra las
// señales explícitamente — decisión 108.)
import { sql } from 'drizzle-orm';
import { date, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { zones } from './zones.js';

export const zoneQuerySignals = pgTable(
  'zone_query_signals',
  {
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    day: date('day')
      .notNull()
      .default(sql`(now() at time zone 'utc')::date`),
  },
  (table) => [primaryKey({ columns: [table.zoneId, table.day] })]
);

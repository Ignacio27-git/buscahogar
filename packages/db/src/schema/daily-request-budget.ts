// ROADMAP 1.13 (diseño DD-12) — ledger PERSISTENTE de presupuesto diario de
// peticiones, una fila por (día UTC, fuente). Sobrevive al reinicio del
// proceso: a diferencia de `SweepBudget`
// (`apps/ingestion/src/sources/idealista/budget.ts`, en memoria, por
// barrido — DD-13, NO tocado por este cambio), este es el tope DIARIO,
// compartido por todos los procesos worker que puedan estar en marcha a la
// vez.
//
// `searchCap` se guarda EN la propia fila, no como una constante fija en
// código: es el tope vigente en el momento en que la fila se abrió, para
// que un tope cambiado a mitad de mes quede auditable (decisión 066). El
// valor real del tope (derivado de la cuota mensual, DD-11) lo decide el
// llamador (composición de `apps/ingestion`, Unit C) — este esquema no
// fabrica ni asume ninguna cifra.
//
// CORRECCIÓN post-verificación (work unit B, hallazgo del orchestrator) —
// `daily_request_budget_search_requests_check`: `budget-ledger.ts` ya
// evita disparar este CHECK en su uso normal (guarda el tope también en la
// PRIMERA reserva del día, no solo en la rama de conflicto). Este CHECK es
// el respaldo ESTRUCTURAL a nivel de base de datos — protege la tabla de
// cualquier otro escritor futuro que no pase por `reserveDailyBudget`,
// mismo idioma que `zones_state_check` (`zones.ts`) y
// `locations_ine_code_check` (`locations.ts`, work unit A).
import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns.js';
import { sources } from './sources.js';

export const dailyRequestBudget = pgTable(
  'daily_request_budget',
  {
    id: id(),
    day: date('day').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    searchRequests: integer('search_requests').notNull().default(0),
    tokenRequests: integer('token_requests').notNull().default(0),
    searchCap: integer('search_cap').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('daily_request_budget_day_source_idx').on(table.day, table.sourceId),
    check('daily_request_budget_search_requests_check', sql`${table.searchRequests} <= ${table.searchCap}`),
  ]
);

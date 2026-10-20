// ROADMAP 3.3 (decisión 248; diseño D4) — registro MENSUAL de cuota de peticiones,
// una fila por (mes UTC, fuente). Es el techo que la API de Idealista impone
// (cuota mensual limitada) y la única fuente de verdad del total y de la reserva:
// nunca variables de entorno por proceso ni cifras por defecto (decisión 066).
//
// - `total_cap`: peticiones de búsqueda del mes. `reserve`: parte del total que SOLO
//   puede gastar la demanda de usuario (on-demand); el resto lo comparten el batch,
//   el refresco y la verificación de presencia (D5).
// - Contadores por carril (`batch_requests`, `on_demand_requests`, `refresh_requests`)
//   y su suma `search_requests`; `token_requests` aparte (el token no consume cuota de
//   búsqueda, como en `daily_request_budget`).
// - El mes se calcula SIEMPRE con el reloj de Postgres (`date_trunc('month', now() at
//   time zone 'utc')`), nunca con el del proceso Node. Se asume que la cuota de
//   Idealista se reinicia el mes natural UTC (pregunta abierta, pendiente de confirmar).
// - Un mes sin fila hereda total y reserva de la fila anterior más reciente, con los
//   contadores a 0 (PD10); sin ninguna fila previa no se gasta nada en ningún carril.
//
// Los CHECK son el respaldo ESTRUCTURAL frente a cualquier escritor que no pase por
// `reserveRequestBudget` (mismo idioma que `daily_request_budget`).
//
// PRIVILEGIOS (NF2, D8b): ni `web_readonly` ni `web_coverage` pueden tocar esta tabla.
// Los privilegios por defecto del bootstrap concederían SELECT a `web_readonly`, así
// que la migración 0019 y `sql/bootstrap-roles-grants.sql` hacen un REVOKE explícito.
import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sources } from './sources.js';

export const monthlyRequestBudget = pgTable(
  'monthly_request_budget',
  {
    month: date('month').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    totalCap: integer('total_cap').notNull(),
    reserve: integer('reserve').notNull(),
    searchRequests: integer('search_requests').notNull().default(0),
    batchRequests: integer('batch_requests').notNull().default(0),
    onDemandRequests: integer('on_demand_requests').notNull().default(0),
    refreshRequests: integer('refresh_requests').notNull().default(0),
    tokenRequests: integer('token_requests').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.sourceId], name: 'monthly_request_budget_pk' }),
    check('monthly_request_budget_total_cap_check', sql`${table.totalCap} > 0`),
    check('monthly_request_budget_reserve_check', sql`${table.reserve} >= 0 and ${table.reserve} < ${table.totalCap}`),
    check(
      'monthly_request_budget_counters_check',
      sql`${table.batchRequests} >= 0 and ${table.onDemandRequests} >= 0 and ${table.refreshRequests} >= 0 and ${table.tokenRequests} >= 0`
    ),
    check(
      'monthly_request_budget_search_requests_check',
      sql`${table.searchRequests} = ${table.batchRequests} + ${table.onDemandRequests} + ${table.refreshRequests} and ${table.searchRequests} <= ${table.totalCap}`
    ),
  ]
);

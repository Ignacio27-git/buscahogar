// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage Limit...",
// diseño decisión 076) — tope diario POR CLIENTE del registro de nuevos
// `coverage_jobs`, distinto del tope GLOBAL (`daily_request_budget`, DD-12).
// Clave primaria compuesta `(key_hash, day)`, nunca `id()` + índice: una
// fila por cliente y día, sin columna sustituta — la propia clave primaria
// ES la garantía de unicidad que el UPSERT atómico (decisión 077,
// `client-quota.ts`) necesita para su `ON CONFLICT (key_hash, day)`.
//
// `key_hash` es SIEMPRE el hex de HMAC-SHA256(identidad, CLIENT_IP_HMAC_KEY)
// (`apps/web/src/server/client-identity.ts`, PR2) — este esquema nunca
// almacena la IP cruda; ninguna columna de este esquema podría hacerlo
// aunque quisiera, así que la garantía RGPD (decisión 076) es estructural,
// no solo disciplina de quien escribe.
import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

export const coverageClientQuota = pgTable(
  'coverage_client_quota',
  {
    keyHash: text('key_hash').notNull(),
    day: date('day').notNull(),
    registrations: integer('registrations').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.keyHash, table.day] }),
    check('coverage_client_quota_registrations_check', sql`${table.registrations} >= 0`),
  ]
);

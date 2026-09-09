// Estado de barrido de una zona (relación 1:1 con `locations`). El barrido
// real lo orquesta la cola `coverage_jobs`; esta tabla solo guarda el estado
// consolidado y la última vez que la zona se barrió por completo.
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns.js';
import { locations } from './locations.js';

export const zones = pgTable(
  'zones',
  {
    id: id(),
    locationId: uuid('location_id')
      .notNull()
      .unique()
      .references(() => locations.id),
    // 'uncovered' | 'covering' | 'covered' | 'stale'.
    state: text('state').notNull().default('uncovered'),
    lastSweptAt: timestamp('last_swept_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'zones_state_check',
      sql`${table.state} in ('uncovered', 'covering', 'covered', 'stale')`
    ),
  ]
);

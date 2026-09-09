// Cola de trabajos de barrido: qué zona, contra qué fuente, y en qué estado.
// El índice único parcial evita encolar dos barridos simultáneos de la misma
// zona y fuente, lo que gastaría cuota de la API dos veces (ver CLAUDE.md).
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns';
import { coverageJobStatus } from './enums';
import { sources } from './sources';
import { zones } from './zones';

export const coverageJobs = pgTable(
  'coverage_jobs',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    status: coverageJobStatus('status').notNull().default('pending'),
    // Cursor de reanudación de paginación de la fuente, opaco para este
    // esquema (lo interpreta únicamente el conector de `apps/ingestion`).
    cursor: text('cursor'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('coverage_jobs_status_requested_at_idx').on(table.status, table.requestedAt),
    // Como mucho un barrido pendiente/en curso por zona y fuente a la vez.
    uniqueIndex('coverage_jobs_zone_source_pending_idx')
      .on(table.zoneId, table.sourceId)
      .where(sql`${table.status} in ('pending', 'running')`),
  ]
);

// Cola de trabajos de barrido: qué zona, contra qué fuente, y en qué estado.
// El índice único parcial evita encolar dos barridos simultáneos de la misma
// zona y fuente, lo que gastaría cuota de la API dos veces (ver CLAUDE.md).
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns.js';
import { coverageJobStatus } from './enums.js';
import { sources } from './sources.js';
import { zones } from './zones.js';

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
    // Retenido tras DD-16 (abajo): implicado por el índice único total, pero
    // quitarlo cambiaría una invariante que el paso 1.7 fijó a propósito, lo
    // cual no es asunto de este cambio.
    uniqueIndex('coverage_jobs_zone_source_pending_idx')
      .on(table.zoneId, table.sourceId)
      .where(sql`${table.status} in ('pending', 'running')`),
    // ROADMAP 1.13 (diseño DD-16, arbitraje CR-3) — el índice PARCIAL de
    // arriba no cubre `status = 'failed'`: un barrido que falla dentro de
    // transporte deja `zones.state = 'uncovered'` (coverage-store.ts,
    // `finishJob`), así que una nueva búsqueda de la misma zona vuelve a
    // pasar el chequeo "uncovered", el `INSERT` no encuentra conflicto en el
    // índice parcial, y se crea una SEGUNDA fila para el mismo
    // `(zone_id, source_id)`. `claimJob` selecciona sin `ORDER BY`/`LIMIT`
    // (coverage-store.ts:51-54), así que cuál de las dos reclama es
    // no determinista y `attempts` deja de significar lo que su comentario
    // dice. Este índice único TOTAL cierra ese hueco a nivel de base de
    // datos: como mucho una fila por `(zone_id, source_id)` durante toda su
    // vida, sea cual sea su estado. `apps/web` inserta con
    // `ON CONFLICT DO NOTHING` sin `target` (DD-16), así que cualquier
    // conflicto —contra este índice o el parcial— se trata como éxito.
    //
    // Consecuencia asumida y documentada (DD-16, no una regresión): si la
    // migración se aplica sobre una base de datos de desarrollo que ya
    // contiene un par `(zone_id, source_id)` duplicado, la migración falla
    // ruidosamente. Ese es el resultado diseñado (R10) — mejor un fallo
    // explícito en el momento de migrar que dejar el hueco abierto.
    uniqueIndex('coverage_jobs_zone_source_idx').on(table.zoneId, table.sourceId),
  ]
);

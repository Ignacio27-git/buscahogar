// Cola de trabajos de barrido: qué zona, contra qué fuente, con qué operación
// (`sale`/`rent`), y en qué estado. El índice único parcial evita encolar dos
// barridos simultáneos de la misma zona, fuente y operación, lo que gastaría
// cuota de la API dos veces (ver CLAUDE.md).
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    // ROADMAP 3.3 (decisión 250) — operación del job: `sale` o `rent`. Venta y
    // alquiler de una misma zona son jobs independientes, con cursores
    // independientes. NOT NULL y SIN valor por defecto: cada escritor debe
    // decidirla (como `listing_versions.operation`). La migración 0018 rellenó los
    // jobs existentes con `rent`, la única operación que se barrió hasta 3.2.
    operation: text('operation').notNull(),
    status: coverageJobStatus('status').notNull().default('pending'),
    // Cursor de reanudación de paginación de la fuente, opaco para este
    // esquema (lo interpreta únicamente el conector de `apps/ingestion`).
    cursor: text('cursor'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104) — marca del
    // carril de refresco. NULL = trabajo a demanda (lo creó una búsqueda);
    // no nulo = lo re-encoló el planificador de refresco. La selección ordena
    // los NULL primero (prioridad a la demanda del usuario), y `finishJob`
    // (completado) lo limpia. `requested_at` NUNCA se toca al refrescar: es el
    // ancla de demanda de las zonas sin señales.
    refreshRequestedAt: timestamp('refresh_requested_at', { withTimezone: true }),
    // ROADMAP 2.5 (S3; decisión 105) — inicio del ciclo de barrido en curso o
    // del último completado. `claimJob` lo fija SOLO cuando el cursor guardado
    // es NULL (arranque limpio) y lo CONSERVA en las reanudaciones, de modo que
    // un ciclo que abarca varios ticks (presupuesto agotado y reanudado) tiene
    // un único inicio. Los anuncios vistos durante el ciclo tienen `last_seen_at
    // >= cycle_started_at`; los activos de la zona con `last_seen_at` anterior
    // son candidatos a ausentes. NULL en jobs previos a 0015: sin ciclo conocido
    // no se nomina a nadie (fail-safe).
    cycleStartedAt: timestamp('cycle_started_at', { withTimezone: true }),
    // ROADMAP 3.3 (decisión 250) — cobertura POR OPERACIÓN: `finishJob(completed)`
    // la fija y nunca la limpia un refresco ni un fallo. (zona, operación)
    // está cubierta si y solo si no es NULL. `zones.state` queda como agregado y
    // no se usa para decidir.
    lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
    // ROADMAP 3.3 (decisión 250) — marca de trabajo parcial de un presweep: la
    // fija el reclamo del carril por lotes y la limpia el ciclo completado. Una
    // zona con demanda reciente promueve estos jobs al carril a demanda (PR4b).
    presweepRequestedAt: timestamp('presweep_requested_at', { withTimezone: true }),
  },
  (table) => [
    index('coverage_jobs_status_requested_at_idx').on(table.status, table.requestedAt),
    // Como mucho un barrido pendiente/en curso por zona, fuente y operación a la
    // vez. La operación forma parte de la clave (decisión 250): con el índice
    // anterior, un par sale+rent pendiente de la misma zona chocaba y el
    // `ON CONFLICT DO NOTHING` sin target descartaba uno en silencio.
    uniqueIndex('coverage_jobs_zone_source_op_pending_idx')
      .on(table.zoneId, table.sourceId, table.operation)
      .where(sql`${table.status} in ('pending', 'running')`),
    // ROADMAP 1.13 (diseño DD-16, arbitraje CR-3) — el índice PARCIAL de arriba
    // no cubre `status = 'failed'`: un barrido que falla deja `zones.state =
    // 'uncovered'`, así que una nueva búsqueda volvía a pasar el chequeo
    // "uncovered" y creaba una SEGUNDA fila para la misma clave. Este índice
    // único TOTAL cierra ese hueco a nivel de base de datos: como mucho una fila
    // por `(zone_id, source_id, operation)` durante toda su vida, sea cual sea su
    // estado. `apps/web` inserta con `ON CONFLICT DO NOTHING` sin `target`
    // (DD-16), así que cualquier conflicto —contra este índice o el parcial— se
    // trata como éxito. Si la migración se aplica sobre una base con un par
    // duplicado, falla ruidosamente (R10): mejor un fallo explícito.
    uniqueIndex('coverage_jobs_zone_source_op_idx').on(table.zoneId, table.sourceId, table.operation),
    check('coverage_jobs_operation_check', sql`${table.operation} in ('sale', 'rent')`),
  ]
);

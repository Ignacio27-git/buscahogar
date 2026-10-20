// ROADMAP 1.13 Unit C (diseño DD-17/DD-18) — selección del siguiente trabajo
// reclamable (paso 1 de la tabla del tick) y marcado de un trabajo fallido
// ANTES de reclamarlo (paso 3: un centroide nulo aborta antes de llegar a
// claimJob).
//
// Deliberadamente en un módulo NUEVO, no en coverage-store.ts: el diseño
// (§2, "Technical approach") declara ese fichero SIN TOCAR por este cambio,
// y su unión JobOutcome (store.ts) no tiene ninguna variante para "nunca
// reclamado, sin cursor, sin resumeCursor" — inventar una la ensancharía sin
// necesidad para el único caso (paso 1.7) que ya la usa. `attempts` no se
// incrementa aquí, por el mismo principio que "presupuesto antes de
// reclamar" (DD-18 paso 5): resolver la geometría de la zona no es un
// intento real de la fuente, así que no debe contar como uno.
import { coverageJobs } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, asc, eq, isNotNull, lt, or, sql } from 'drizzle-orm';

import type { JobOperation } from './store.js';

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104) — carril del job:
// 'on-demand' lo creó una búsqueda de usuario; 'refresh' lo re-encoló el
// planificador de refresco (`coverage_jobs.refresh_requested_at` no nulo).
// Decide el techo de presupuesto con el que se reserva (coverage-worker.ts).
export type JobLane = 'on-demand' | 'refresh';

export interface PollJob {
  readonly jobId: string;
  readonly zoneId: string;
  readonly sourceId: string;
  // ROADMAP 3.3 (decisión 252): operación del job. El worker único la usa para
  // construir el área y reclamar el job; ya no existe una operación por proceso.
  readonly operation: JobOperation;
  // Opcional en el tipo: ausente equivale a 'on-demand' (los dobles de test
  // anteriores a 2.5 no lo declaran). `selectNextClaimableJob` lo rellena
  // siempre.
  readonly lane?: JobLane;
}

// `coverage_jobs.operation` es `text` con CHECK en ('sale', 'rent'): se estrecha
// sin aserciones de tipo. Un valor distinto es una violación del esquema.
function parseOperation(value: string): JobOperation {
  if (value === 'sale' || value === 'rent') {
    return value;
  }
  throw new Error(`coverage_jobs.operation inesperada: "${value}" (el CHECK solo admite sale o rent).`);
}

// DD-18 paso 1: 'pending', o 'failed' con reintentos restantes. Orden
// (ROADMAP 2.5, ZRS-10): primero los trabajos A DEMANDA (`refresh_requested_at`
// NULL), después los de refresco, y dentro de cada carril el más antiguo por
// `requested_at`. La demanda del usuario nunca espera detrás de un refresco.
// `coverage_jobs_status_requested_at_idx` (schema/coverage-jobs.ts) cubre el
// filtro; el conjunto de jobs pendientes es pequeño (una fila por zona).
export async function selectNextClaimableJob(db: Database, maxAttempts: number): Promise<PollJob | null> {
  const [row] = await db
    .select({
      id: coverageJobs.id,
      zoneId: coverageJobs.zoneId,
      sourceId: coverageJobs.sourceId,
      operation: coverageJobs.operation,
      isRefresh: isNotNull(coverageJobs.refreshRequestedAt),
    })
    .from(coverageJobs)
    .where(
      or(
        eq(coverageJobs.status, 'pending'),
        and(eq(coverageJobs.status, 'failed'), lt(coverageJobs.attempts, maxAttempts))
      )
    )
    .orderBy(sql`(${coverageJobs.refreshRequestedAt} is not null)`, asc(coverageJobs.requestedAt))
    .limit(1);

  return row
    ? {
        jobId: row.id,
        zoneId: row.zoneId,
        sourceId: row.sourceId,
        operation: parseOperation(row.operation),
        lane: row.isRefresh ? 'refresh' : 'on-demand',
      }
    : null;
}

// DD-18 paso 3: un centroide nulo aborta ANTES de claimJob. El trabajo
// queda 'failed' sin que `attempts` cambie, así que es reseleccionable
// indefinidamente por `selectNextClaimableJob` hasta que Unit D lo impida
// en origen (CR-12/DD-14: el registro de una zona sin centroide inserta
// cero filas) — límite conocido y documentado, no resuelto por este módulo.
export async function markJobFailedWithoutClaim(db: Database, jobId: string, reason: string): Promise<void> {
  await db
    .update(coverageJobs)
    .set({ status: 'failed', error: reason, finishedAt: new Date() })
    .where(eq(coverageJobs.id, jobId));
}

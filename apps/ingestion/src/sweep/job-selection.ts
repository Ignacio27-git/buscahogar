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
import { and, asc, eq, lt, or } from 'drizzle-orm';

export interface PollJob {
  readonly jobId: string;
  readonly zoneId: string;
  readonly sourceId: string;
}

// DD-18 paso 1: 'pending', o 'failed' con reintentos restantes — el más
// antiguo primero. `coverage_jobs_status_requested_at_idx`
// (schema/coverage-jobs.ts) ya cubre ambas ramas de este OR.
export async function selectNextClaimableJob(db: Database, maxAttempts: number): Promise<PollJob | null> {
  const [row] = await db
    .select({ id: coverageJobs.id, zoneId: coverageJobs.zoneId, sourceId: coverageJobs.sourceId })
    .from(coverageJobs)
    .where(
      or(
        eq(coverageJobs.status, 'pending'),
        and(eq(coverageJobs.status, 'failed'), lt(coverageJobs.attempts, maxAttempts))
      )
    )
    .orderBy(asc(coverageJobs.requestedAt))
    .limit(1);

  return row ? { jobId: row.id, zoneId: row.zoneId, sourceId: row.sourceId } : null;
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

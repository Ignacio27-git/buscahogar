// ROADMAP 3.4 (decisión 258, parte 2; D14b) — recuperación de jobs `running` abandonados.
//
// `RECLAIMABLE_STATUSES` (coverage-store.ts) excluye `running` a propósito: significa que otro proceso tiene el
// job. Pero un worker matado sin cierre ordenado (SIGKILL, fallo del host, OOM) deja su job `running` para
// siempre, y ni la selección ni el reclamo lo volverán a tocar. El arrendamiento (`lease_renewed_at`, migración
// 0021) distingue "en curso" de "abandonado": `claimJob` y cada avance de cursor de `persistPage` lo renuevan con
// el reloj de la base de datos.
//
// Un job cuyo arrendamiento (o, sin él, `started_at`, y como último recurso `requested_at`) es más antiguo que
// `staleAfterMs` pasa a `failed` con el error fijo `stale-running-reclaimed`:
// - el cursor y `cycle_started_at` se CONSERVAN, así que la reselección retoma donde quedó sin repetir páginas
//   ya pagadas (CLAUDE.md: la cuota es limitada);
// - `attempts` ya se incrementó al reclamar, así que `COVERAGE_JOB_MAX_ATTEMPTS` acota a un job que mata al
//   worker una y otra vez (con `pending` no habría tope y el bucle de caídas sería infinito);
// - el ledger de cuota NO se toca (decisión 248): la reserva del tick abortado nunca se concilia, de modo que
//   el contador queda SOBRE-contado (dirección segura), acotado por `MAX_SEARCH_REQUESTS_PER_SWEEP` +
//   `TOKEN_RESERVE` por incidente. Reconciliar sería adivinar lo gastado.
//
// SUPUESTO DE UN SOLO WORKER (decisión 252): con varios workers, un dueño lento pero vivo podría ver su job
// reclamado y terminarlo después (benigno: `finishJob` fija el estado final). `STALE_RUNNING_JOB_AFTER_MS` debe
// exceder lo que tarda una página (la mínima admitida lo garantiza).
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';

// Error con el que se marca un job reclamado; también la clave que reconocen el runbook y las alertas (S6).
export const STALE_RUNNING_ERROR = 'stale-running-reclaimed';

// 15 minutos por defecto; mínimo 2 minutos (validado en `readEnv`): debe exceder con holgura una página.
export const DEFAULT_STALE_RUNNING_JOB_AFTER_MS = 900_000;
export const MIN_STALE_RUNNING_JOB_AFTER_MS = 120_000;

// Corte explícito: como mucho este número de jobs por pasada. Con un solo worker nunca habrá más de unos pocos;
// el límite impide que una tabla corrupta convierta la pasada en una escritura masiva.
export const STALE_RECLAIM_BATCH_LIMIT = 50;

export async function reclaimStaleRunningJobs(
  db: Database,
  staleAfterMs: number,
  limit: number = STALE_RECLAIM_BATCH_LIMIT
): Promise<readonly string[]> {
  if (!Number.isInteger(staleAfterMs) || staleAfterMs <= 0) {
    throw new Error('reclaimStaleRunningJobs: staleAfterMs debe ser un entero positivo (milisegundos).');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('reclaimStaleRunningJobs: limit debe ser un entero positivo.');
  }
  // Una sola sentencia: el reloj es el de Postgres (el mismo que fija el arrendamiento). La subconsulta bloquea
  // las filas con SKIP LOCKED para que una pasada concurrente no se pise con esta.
  const { rows } = await db.execute<{ id: string }>(sql`
    update coverage_jobs
    set status = 'failed', error = ${STALE_RUNNING_ERROR}, finished_at = now()
    where id in (
      select id from coverage_jobs
      where status = 'running'
        and coalesce(lease_renewed_at, started_at, requested_at) < now() - (${staleAfterMs}::bigint * interval '1 millisecond')
      order by coalesce(lease_renewed_at, started_at, requested_at)
      limit ${limit}
      for update skip locked
    )
    returning id
  `);
  return rows.map((row) => row.id);
}

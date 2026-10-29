// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103/104) — capa SQL del
// planificador de refresco de zonas. `packages/core/src/retention` decide
// (política pura); este módulo solo lee las fotos con el reloj de Postgres y
// aplica el re-encolado. Ningún cálculo de fechas ocurre en Node (DD-11): el
// core recibe enteros ya resueltos.
//
// Lo usa el propietario (`apps/ingestion`, worker). Zod-free y sin
// `process.env`, como el resto de `packages/db`.
import type { RefreshTarget, ZoneLifecycleSnapshot } from '@buscahogar/core';
import { sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { utcDayStart } from './time.js';

export interface ZoneLifecycleQuery {
  readonly sourceId: string;
  // Reintentos máximos del worker: un job `failed` solo es elegible para
  // refresco cuando ya los agotó (si le quedan, el worker lo reintenta solo).
  readonly maxAttempts: number;
}

interface ZoneLifecycleRow extends Record<string, unknown> {
  zone_id: string;
  operation: 'sale' | 'rent';
  days_since_last_demand: number;
  seconds_since_last_sweep: number | null;
  refresh_eligible: boolean;
}

// Una fila por job de la fuente, es decir, por (zona, operación) (decisión 250).
// El último día de demanda es
// `coalesce(max(signal.day), requested_at UTC)` (ZRS-5): nunca
// `zones.created_at` (uniforme por el seed) ni `last_swept_at` (mide oferta,
// no demanda). El último barrido es el de ESA operación
// (`coverage_jobs.last_completed_at`); `zones.last_swept_at` es agregado.
// `refresh_eligible` (ZRS-8): operación cubierta (`last_completed_at` no nulo)
// cuyo job está `done`, o `failed` con los reintentos agotados.
export async function listZoneLifecycle(
  db: Database,
  query: ZoneLifecycleQuery
): Promise<readonly ZoneLifecycleSnapshot[]> {
  const today = sql`(${utcDayStart()})::date`;
  const result = await db.execute<ZoneLifecycleRow>(sql`
    select
      z.id as zone_id,
      j.operation,
      (${today} - coalesce(
        (select max(s.day) from zone_query_signals s where s.zone_id = z.id),
        (select max(j2.requested_at) from coverage_jobs j2
          where j2.zone_id = j.zone_id and j2.source_id = j.source_id) at time zone 'utc'
      )::date)::integer as days_since_last_demand,
      case when j.last_completed_at is null then null
           else floor(extract(epoch from now() - j.last_completed_at))::double precision
      end as seconds_since_last_sweep,
      (j.last_completed_at is not null
        and (j.status = 'done' or (j.status = 'failed' and j.attempts >= ${query.maxAttempts}::integer))
      ) as refresh_eligible
    from coverage_jobs j
    join zones z on z.id = j.zone_id
    where j.source_id = ${query.sourceId}
    order by j.requested_at, z.id, j.operation
  `);

  return result.rows.map((row) => ({
    zoneId: row.zone_id,
    operation: row.operation,
    daysSinceLastDemand: row.days_since_last_demand,
    secondsSinceLastSweep: row.seconds_since_last_sweep,
    refreshEligible: row.refresh_eligible,
  }));
}

export interface ScheduleRefreshRequest extends ZoneLifecycleQuery {
  readonly targets: readonly RefreshTarget[];
}

// Re-encola los jobs de las (zona, operación) pedidas (ZRS-8/9): `pending`,
// `attempts = 0` (los intentos pasan a ser por ciclo), `error = NULL` y
// `refresh_requested_at = now()` — la marca del carril de refresco. NUNCA toca
// `requested_at` (ancla de demanda de las zonas sin señales), `zones.state`
// (sigue `covered` durante el refresco: nunca `stale`) ni `last_completed_at`
// (la operación sigue cubierta mientras se refresca). El cursor SE REINICIA
// (`NULL`): un refresco es un ciclo nuevo. Un job `failed` agotado conservaría
// un cursor a mitad de paginación y reanudaría desde ahí, y S3
// (`cycle_started_at` solo se fija con cursor NULL) nunca abriría un ciclo
// nuevo. Los `done` ya tienen cursor NULL. La elegibilidad (incluida la
// cobertura de la operación) se COMPRUEBA DE NUEVO en el UPDATE: entre el
// listado y la escritura otro proceso pudo haber reclamado el job. Devuelve
// cuántos jobs se re-encolaron.
export async function scheduleRefresh(db: Database, request: ScheduleRefreshRequest): Promise<number> {
  if (request.targets.length === 0) {
    return 0;
  }
  const targetList = sql.join(
    request.targets.map((target) => sql`(${target.zoneId}::uuid, ${target.operation})`),
    sql`, `
  );
  const result = await db.execute(sql`
    update coverage_jobs
    set status = 'pending', attempts = 0, error = null, cursor = null, refresh_requested_at = now()
    where source_id = ${request.sourceId}
      and (zone_id, operation) in (${targetList})
      and (status = 'done' or (status = 'failed' and attempts >= ${request.maxAttempts}::integer))
      and last_completed_at is not null
  `);
  return result.rowCount ?? 0;
}

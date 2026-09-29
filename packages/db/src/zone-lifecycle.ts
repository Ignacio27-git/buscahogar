// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103/104) — capa SQL del
// planificador de refresco de zonas. `packages/core/src/retention` decide
// (política pura); este módulo solo lee las fotos con el reloj de Postgres y
// aplica el re-encolado. Ningún cálculo de fechas ocurre en Node (DD-11): el
// core recibe enteros ya resueltos.
//
// Lo usa el propietario (`apps/ingestion`, worker). Zod-free y sin
// `process.env`, como el resto de `packages/db`.
import type { ZoneLifecycleSnapshot } from '@buscahogar/core';
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
  days_since_last_demand: number;
  seconds_since_last_sweep: number | null;
  refresh_eligible: boolean;
}

// Una fila por zona con job de la fuente. El último día de demanda es
// `coalesce(max(signal.day), requested_at UTC)` (ZRS-5): nunca
// `zones.created_at` (uniforme por el seed) ni `last_swept_at` (mide oferta,
// no demanda). `refresh_eligible` (ZRS-8): zona `covered` cuyo job está `done`,
// o `failed` con los reintentos agotados.
export async function listZoneLifecycle(
  db: Database,
  query: ZoneLifecycleQuery
): Promise<readonly ZoneLifecycleSnapshot[]> {
  const today = sql`(${utcDayStart()})::date`;
  const result = await db.execute<ZoneLifecycleRow>(sql`
    select
      z.id as zone_id,
      (${today} - coalesce(
        (select max(s.day) from zone_query_signals s where s.zone_id = z.id),
        (j.requested_at at time zone 'utc')::date
      ))::integer as days_since_last_demand,
      case when z.last_swept_at is null then null
           else floor(extract(epoch from now() - z.last_swept_at))::double precision
      end as seconds_since_last_sweep,
      (z.state = 'covered'
        and (j.status = 'done' or (j.status = 'failed' and j.attempts >= ${query.maxAttempts}::integer))
      ) as refresh_eligible
    from coverage_jobs j
    join zones z on z.id = j.zone_id
    where j.source_id = ${query.sourceId}
    order by j.requested_at, z.id
  `);

  return result.rows.map((row) => ({
    zoneId: row.zone_id,
    daysSinceLastDemand: row.days_since_last_demand,
    secondsSinceLastSweep: row.seconds_since_last_sweep,
    refreshEligible: row.refresh_eligible,
  }));
}

export interface ScheduleRefreshRequest extends ZoneLifecycleQuery {
  readonly zoneIds: readonly string[];
}

// Re-encola los jobs de las zonas pedidas (ZRS-8/9): `pending`, `attempts = 0`
// (los intentos pasan a ser por ciclo), `error = NULL` y `refresh_requested_at
// = now()` — la marca del carril de refresco. NUNCA toca `requested_at` (ancla
// de demanda de las zonas sin señales) ni `zones.state` (sigue `covered`
// durante el refresco: nunca `stale`). El cursor SE REINICIA (`NULL`): un
// refresco es un ciclo nuevo. Un job `failed` agotado conservaría un cursor a
// mitad de paginación y reanudaría desde ahí; `finishJob(completed)` sellaría
// entonces `last_swept_at` como barrido completo y S3 (`cycle_started_at` solo
// se fija con cursor NULL) nunca abriría un ciclo nuevo. Los `done` ya tienen
// cursor NULL. La
// elegibilidad se COMPRUEBA DE NUEVO en el UPDATE: entre el listado y la
// escritura otro proceso pudo haber reclamado el job. Devuelve cuántos
// jobs se re-encolaron.
export async function scheduleRefresh(db: Database, request: ScheduleRefreshRequest): Promise<number> {
  if (request.zoneIds.length === 0) {
    return 0;
  }
  const zoneIdList = sql.join(
    request.zoneIds.map((zoneId) => sql`${zoneId}::uuid`),
    sql`, `
  );
  const result = await db.execute(sql`
    update coverage_jobs
    set status = 'pending', attempts = 0, error = null, cursor = null, refresh_requested_at = now()
    where source_id = ${request.sourceId}
      and zone_id in (${zoneIdList})
      and (status = 'done' or (status = 'failed' and attempts >= ${request.maxAttempts}::integer))
      and exists (
        select 1 from zones z where z.id = coverage_jobs.zone_id and z.state = 'covered'
      )
  `);
  return result.rowCount ?? 0;
}

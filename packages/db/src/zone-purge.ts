// ROADMAP 2.5 (refresh-retention-policy, S4; decisión 108) — purga de zona como
// REINICIO de cobertura, sin llamadas a la fuente ni gasto de cuota. La decide
// `packages/core` (`planZoneMaintenance`: zona con ≥ 180 días sin consultas);
// este módulo solo la aplica, con el reloj de Postgres (DD-11).
//
// Por cada job (zona Z, fuente S), en UNA transacción:
//   (a) los anuncios ACTIVOS de S dentro del círculo de Z (`locations.centroid`
//       + `sweep_radius_m`) y fuera del círculo de cualquier otra zona con job
//       de S pasan a `inactive` con motivo `zone_purged` (luego siguen el plano
//       de 180 días del tombstone); su fila de la cola de presencia se borra;
//   (b) se refresca la visibilidad de sus viviendas;
//   (c) se borra el job;
//   (d) y, si ya no queda ningún job de la zona, sus señales;
//   (e) y la zona vuelve a `uncovered` con `last_swept_at` NULL.
// La fila de `zones` NUNCA se borra: es el catálogo INE sembrado que consultan
// la interfaz y `locations-query`. Los anuncios sin coordenadas nunca se
// retiran (límite conocido). No se borra ningún anuncio, versión, vivienda ni
// `property_listings`.
//
// Lo usa el propietario (`apps/ingestion`); Zod-free y sin `process.env`.
import { sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { refreshPropertyVisibility } from './visibility.js';
import { utcDayStart } from './time.js';

export interface ZonePurgeRequest {
  readonly sourceId: string;
  // Zonas a purgar, en el orden del plan: se procesan en SECUENCIA, de modo que
  // cada purga ve las anteriores como ya desaparecidas (S-RP-4).
  readonly zoneIds: readonly string[];
  // Umbral de días sin consulta (constante de `packages/core`). Se vuelve a
  // comprobar DENTRO de la transacción: entre el plan y la purga pudo llegar
  // una consulta nueva (señal) o el job pudo reclamarse.
  readonly purgeAfterDays: number;
}

export interface ZonePurgeFailure {
  readonly zoneId: string;
  readonly message: string;
}

export interface ZonePurgeResult {
  // Zonas reiniciadas.
  readonly purged: readonly string[];
  // Zonas que ya no cumplían la condición al ejecutar (job ausente o en curso,
  // demanda reciente): no se toca nada.
  readonly skipped: readonly string[];
  // Zonas cuya transacción falló y se revirtió por completo. Una avería de una
  // zona no impide procesar las siguientes.
  readonly failed: readonly ZonePurgeFailure[];
}

interface JobRow extends Record<string, unknown> {
  id: string;
  status: string;
  days_since_last_demand: number;
}

async function purgeOneZone(db: Database, request: ZonePurgeRequest, zoneId: string): Promise<boolean> {
  return db.transaction(async (tx): Promise<boolean> => {
    // Se bloquea el job: nadie lo reclama ni lo re-encola mientras dura la purga.
    const today = sql`(${utcDayStart()})::date`;
    const jobs = await tx.execute<JobRow>(sql`
      select j.id, j.status,
             (${today} - coalesce(
               (select max(s.day) from zone_query_signals s where s.zone_id = j.zone_id),
               (j.requested_at at time zone 'utc')::date
             ))::integer as days_since_last_demand
        from coverage_jobs j
       where j.zone_id = ${zoneId}::uuid and j.source_id = ${request.sourceId}::uuid
         for update
    `);
    const job = jobs.rows[0];
    if (!job || job.status === 'running' || job.days_since_last_demand < request.purgeAfterDays) {
      return false;
    }

    // (a) Retirada. Las demás zonas "vivas" son las que conservan un job de la
    // fuente: sus círculos siguen cubriendo al anuncio.
    const retired = await tx.execute<{ id: string }>(sql`
      update listings l
         set status = 'inactive', inactive_since = now(), inactive_reason = 'zone_purged', updated_at = now()
        from zones z
        join locations loc on loc.id = z.location_id
       where z.id = ${zoneId}::uuid
         and l.source_id = ${request.sourceId}::uuid
         and l.status = 'active'
         and l.location_geography is not null
         and loc.centroid is not null
         and loc.sweep_radius_m is not null
         and ST_DWithin(l.location_geography, loc.centroid, loc.sweep_radius_m)
         and not exists (
           select 1
             from coverage_jobs j2
             join zones z2 on z2.id = j2.zone_id
             join locations loc2 on loc2.id = z2.location_id
            where j2.source_id = ${request.sourceId}::uuid
              and j2.zone_id <> ${zoneId}::uuid
              and loc2.centroid is not null
              and loc2.sweep_radius_m is not null
              and ST_DWithin(l.location_geography, loc2.centroid, loc2.sweep_radius_m)
         )
      returning l.id
    `);
    const retiredIds = retired.rows.map((row) => row.id);

    // Cola de presencia: la de los anuncios retirados y la nominada por esta
    // zona (su job desaparece; el próximo ciclo de otra zona vuelve a nominar).
    await tx.execute(sql`delete from listing_presence_checks where zone_id = ${zoneId}::uuid`);
    if (retiredIds.length > 0) {
      const idList = sql.join(
        retiredIds.map((id) => sql`${id}::uuid`),
        sql`, `
      );
      await tx.execute(sql`delete from listing_presence_checks where listing_id in (${idList})`);
    }

    // (b) Visibilidad de las viviendas afectadas.
    await refreshPropertyVisibility(tx, { listingIds: retiredIds });

    // (c) El job.
    await tx.execute(sql`delete from coverage_jobs where id = ${job.id}::uuid`);

    // (d, e) Señales y estado de la zona, solo si ninguna otra fuente la sigue
    // cubriendo: la demanda y el estado son de la zona, no de una fuente.
    const remaining = await tx.execute<{ n: number }>(sql`
      select count(*)::integer as n from coverage_jobs where zone_id = ${zoneId}::uuid
    `);
    if ((remaining.rows[0]?.n ?? 0) === 0) {
      await tx.execute(sql`delete from zone_query_signals where zone_id = ${zoneId}::uuid`);
      await tx.execute(sql`
        update zones set state = 'uncovered', last_swept_at = null, updated_at = now() where id = ${zoneId}::uuid
      `);
    }
    return true;
  });
}

// Drizzle envuelve el error de `pg` en "Failed query: <sql> params: <valores>";
// el mensaje útil (y sin parámetros) es el de la causa más interna.
function rootMessage(error: unknown): string {
  let current: unknown = error;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

export async function purgeZones(db: Database, request: ZonePurgeRequest): Promise<ZonePurgeResult> {
  const purged: string[] = [];
  const skipped: string[] = [];
  const failed: ZonePurgeFailure[] = [];

  for (const zoneId of request.zoneIds) {
    try {
      if (await purgeOneZone(db, request, zoneId)) {
        purged.push(zoneId);
      } else {
        skipped.push(zoneId);
      }
    } catch (error) {
      failed.push({ zoneId, message: rootMessage(error) });
    }
  }
  return { purged, skipped, failed };
}

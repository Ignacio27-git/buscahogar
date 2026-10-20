// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — capa SQL de la
// verificación de presencia. `packages/core/src/retention` decide (lotes,
// números de la política); `apps/ingestion` habla con la fuente; este módulo
// solo nomina, lee los candidatos vencidos y aplica los veredictos, siempre con
// el reloj de Postgres (DD-11).
//
// Absence only NOMINATES (decisión 039 enmendada): `markAbsenceCandidates` nunca
// escribe el estado de un anuncio. Solo `applyPresenceVerdicts` lo hace, y solo
// para un veredicto `absent` confirmado. Lo usa el propietario (`apps/ingestion`);
// Zod-free y sin `process.env`, como el resto de `packages/db`.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db.js';
import { refreshPropertyVisibility } from './visibility.js';

function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

export interface MarkAbsenceRequest {
  readonly jobId: string;
}

// Llamar SOLO tras `finishJob(completed)`: un ciclo incompleto (tope de páginas,
// presupuesto o error) no es evidencia de ausencia. Nomina cada anuncio ACTIVO de
// la fuente del job, de la operación del JOB (decisión 250: un job de `sale` no
// juzga anuncios de `rent`), dentro del círculo de la zona
// (`locations.centroid` + `sweep_radius_m`, el mismo de barrido y búsqueda) y con
// `last_seen_at < cycle_started_at`. Un job sin `cycle_started_at` (previo a
// 0015) no nomina a nadie. `ON CONFLICT DO NOTHING`: no duplica ni reinicia los
// intentos de una fila existente. Devuelve cuántas filas nuevas entraron.
export async function markAbsenceCandidates(db: Database, request: MarkAbsenceRequest): Promise<number> {
  const result = await db.execute(sql`
    insert into listing_presence_checks (listing_id, zone_id)
    select l.id, j.zone_id
      from coverage_jobs j
      join zones z on z.id = j.zone_id
      join locations loc on loc.id = z.location_id
      join listings l on l.source_id = j.source_id
      join listing_versions lv on lv.listing_id = l.id and lv.is_current
     where j.id = ${request.jobId}::uuid
       and j.cycle_started_at is not null
       and loc.centroid is not null
       and loc.sweep_radius_m is not null
       and l.status = 'active'
       and lv.operation = j.operation
       and l.last_seen_at < j.cycle_started_at
       and l.location_geography is not null
       and ST_DWithin(l.location_geography, loc.centroid, loc.sweep_radius_m)
    on conflict (listing_id) do nothing
  `);
  return result.rowCount ?? 0;
}

export interface DuePresenceQuery {
  readonly sourceId: string;
  // Tope de filas leídas: la verificación de un tick nunca es ilimitada.
  readonly limit: number;
  // Un intento ambiguo no se repite antes de este número de días.
  readonly retryBackoffDays: number;
}

export interface DuePresenceCandidate {
  readonly listingId: string;
  readonly externalId: string;
  readonly zoneId: string;
  readonly center: { readonly latitude: number; readonly longitude: number };
  readonly radiusMeters: number;
  readonly operation: 'sale' | 'rent';
  // Tipo de propiedad CRUDO de la fuente (vocabulario de la respuesta) de la
  // versión vigente; `null` si la versión no conserva el payload.
  readonly rawPropertyType: string | null;
}

interface DuePresenceRow extends Record<string, unknown> {
  listing_id: string;
  external_id: string;
  zone_id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  operation: 'sale' | 'rent';
  raw_property_type: string | null;
}

// Candidatos vencidos: nunca comprobados, o con el último intento hace al menos
// `retryBackoffDays`. Solo anuncios aún activos de la fuente dada (de las dos
// operaciones: el worker único las verifica, decisión 250), con zona
// georreferenciada. Orden por zona y antigüedad de la sospecha:
// un lote tiende a agrupar anuncios de la misma zona.
export async function listDuePresenceCandidates(
  db: Database,
  query: DuePresenceQuery
): Promise<readonly DuePresenceCandidate[]> {
  const result = await db.execute<DuePresenceRow>(sql`
    select c.listing_id,
           l.external_id,
           c.zone_id,
           ST_Y(loc.centroid::geometry) as latitude,
           ST_X(loc.centroid::geometry) as longitude,
           loc.sweep_radius_m as radius_m,
           lv.operation,
           lv.raw ->> 'propertyType' as raw_property_type
      from listing_presence_checks c
      join listings l on l.id = c.listing_id
      join zones z on z.id = c.zone_id
      join locations loc on loc.id = z.location_id
      join listing_versions lv on lv.listing_id = l.id and lv.is_current
     where l.source_id = ${query.sourceId}::uuid
       and l.status = 'active'
       and loc.centroid is not null
       and loc.sweep_radius_m is not null
       and (c.last_checked_at is null
            or c.last_checked_at <= now() - make_interval(days => ${query.retryBackoffDays}::integer))
     order by c.zone_id, c.suspected_at, c.listing_id
     limit ${query.limit}::integer
  `);

  return result.rows.map((row) => ({
    listingId: row.listing_id,
    externalId: row.external_id,
    zoneId: row.zone_id,
    center: { latitude: row.latitude, longitude: row.longitude },
    radiusMeters: row.radius_m,
    operation: row.operation,
    rawPropertyType: row.raw_property_type,
  }));
}

export interface PresenceVerdictIds {
  readonly present: readonly string[];
  readonly absent: readonly string[];
  readonly ambiguous: readonly string[];
}

export interface PresenceApplied {
  readonly present: number;
  readonly absent: number;
  readonly ambiguous: number;
  // Filas de la cola descartadas por agotar los intentos (sin cambiar estado).
  readonly dropped: number;
}

// Aplica los veredictos en UNA transacción (los ids son de listing):
// - present: `last_seen_at = now()` (sigue activo) y sale de la cola.
// - absent: `inactive`/`delisted` con `inactive_since = now()`, sale de la cola
//   y se refresca la visibilidad de sus viviendas. NUNCA toca versiones,
//   `property_listings` ni puntuaciones (LR-8): retirar no reagrupa.
// - ambiguous: `check_attempts + 1`, `last_checked_at = now()` (arranca el
//   backoff) y, al llegar a `maxAttempts`, la fila se descarta SIN cambiar el
//   estado del anuncio (fail-safe).
export async function applyPresenceVerdicts(
  db: Database,
  verdicts: PresenceVerdictIds,
  maxAttempts: number
): Promise<PresenceApplied> {
  if (verdicts.present.length === 0 && verdicts.absent.length === 0 && verdicts.ambiguous.length === 0) {
    return { present: 0, absent: 0, ambiguous: 0, dropped: 0 };
  }

  return db.transaction(async (tx): Promise<PresenceApplied> => {
    let present = 0;
    if (verdicts.present.length > 0) {
      const updated = await tx.execute(sql`
        update listings set last_seen_at = now()
         where id in (${uuidList(verdicts.present)}) and status = 'active'
      `);
      present = updated.rowCount ?? 0;
      await tx.execute(sql`delete from listing_presence_checks where listing_id in (${uuidList(verdicts.present)})`);
    }

    let absent = 0;
    if (verdicts.absent.length > 0) {
      const retired = await tx.execute<{ id: string }>(sql`
        update listings
           set status = 'inactive', inactive_since = now(), inactive_reason = 'delisted', updated_at = now()
         where id in (${uuidList(verdicts.absent)}) and status = 'active'
           -- Guarda de carrera: si un barrido vio el anuncio mientras se verificaba,
           -- el escritor ya borró su fila de la cola y NO se puede retirar.
           and exists (select 1 from listing_presence_checks c where c.listing_id = listings.id)
        returning id
      `);
      absent = retired.rows.length;
      await tx.execute(sql`delete from listing_presence_checks where listing_id in (${uuidList(verdicts.absent)})`);
      await refreshPropertyVisibility(
        tx,
        { listingIds: retired.rows.map((row) => row.id) }
      );
    }

    let ambiguous = 0;
    let dropped = 0;
    if (verdicts.ambiguous.length > 0) {
      const bumped = await tx.execute(sql`
        update listing_presence_checks
           set check_attempts = check_attempts + 1, last_checked_at = now()
         where listing_id in (${uuidList(verdicts.ambiguous)})
      `);
      ambiguous = bumped.rowCount ?? 0;
      const exhausted = await tx.execute(sql`
        delete from listing_presence_checks
         where listing_id in (${uuidList(verdicts.ambiguous)}) and check_attempts >= ${maxAttempts}::integer
      `);
      dropped = exhausted.rowCount ?? 0;
    }

    return { present, absent, ambiguous, dropped };
  });
}

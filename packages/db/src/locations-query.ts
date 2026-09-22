// ROADMAP 1.13 (diseño §5 interfaces, DD-19 mitad de consulta, DD-22,
// arbitraje CR-12) — capa de consulta de zonas, base compartida por Unit C
// (worker) y Unit D (web). Zod-free (decisión 023): tipos planos, sin
// validación — la validación de la entrada externa vive en
// `packages/core` (decisión 057), este módulo solo consulta.
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { locations, zones } from './tables.js';

export interface ZoneSuggestion {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly state: string;
  // CR-12 (arbitraje, SUSTITUYE la exclusión original del spec): un
  // municipio sin centroide aparece IGUAL, marcado `sweepable: false` —
  // nunca oculto. Ocultarlo lo hace indistinguible de una errata.
  readonly sweepable: boolean;
}

// DD-22 — un `%`/`_` literal en la consulta del usuario NO debe actuar como
// comodín SQL; `\` se escapa primero para que su propio escape no se
// interprete dos veces.
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function suggestZones(
  db: Database,
  normalizedPrefix: string,
  limit: number
): Promise<readonly ZoneSuggestion[]> {
  const pattern = `${escapeLikePattern(normalizedPrefix)}%`;

  return db
    .select({
      ineCode: locations.ineCode,
      municipality: locations.municipality,
      province: locations.province,
      state: zones.state,
      sweepable: sql<boolean>`${locations.centroid} is not null`,
    })
    .from(locations)
    .innerJoin(zones, eq(zones.locationId, locations.id))
    .where(sql`${locations.searchName} like ${pattern} escape '\\'`)
    .orderBy(asc(locations.searchName))
    .limit(limit);
}

export interface ZoneGeometry {
  readonly zoneId: string;
  readonly ineCode: string;
  readonly municipality: string;
  readonly state: string;
  readonly centroid: { readonly latitude: number; readonly longitude: number } | null;
  // Invariante impuesta al importar (join.ts/sanity.ts): null si y solo si
  // `centroid` es null — nunca una mitad del par.
  readonly sweepRadiusM: number | null;
}

export async function resolveZoneGeometry(db: Database, ineCode: string): Promise<ZoneGeometry | null> {
  const [row] = await db
    .select({
      zoneId: zones.id,
      ineCode: locations.ineCode,
      municipality: locations.municipality,
      state: zones.state,
      longitude: sql<number | null>`ST_X(${locations.centroid}::geometry)`,
      latitude: sql<number | null>`ST_Y(${locations.centroid}::geometry)`,
      sweepRadiusM: locations.sweepRadiusM,
    })
    .from(zones)
    .innerJoin(locations, eq(zones.locationId, locations.id))
    .where(eq(locations.ineCode, ineCode));

  if (!row) {
    return null;
  }

  return {
    zoneId: row.zoneId,
    ineCode: row.ineCode,
    municipality: row.municipality,
    state: row.state,
    centroid:
      row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
    sweepRadiusM: row.sweepRadiusM,
  };
}

// ROADMAP 1.13 Unit C (diseño §5 interfaces, CoverageWorkerPorts.resolveZoneGeometry)
// — hermana de `resolveZoneGeometry`, misma proyección, distinta clave.
// `coverage_jobs.zone_id` (el FK real que el worker recorre para
// seleccionar un trabajo) es un uuid, nunca un ine_code — la web resuelve
// por código INE porque así llega en la URL (DD-21), el worker resuelve por
// uuid porque así llega en la fila de `coverage_jobs`. Ninguna de las dos
// consultas se deriva de la otra por composición (un JOIN adicional sobre
// el resultado de `resolveZoneGeometry` sería una consulta extra sin
// necesidad); se repite la proyección explícitamente, igual que
// `resolveZoneGeometry` y `suggestZones` ya repiten cada una la suya.
export async function resolveZoneGeometryById(db: Database, zoneId: string): Promise<ZoneGeometry | null> {
  const [row] = await db
    .select({
      zoneId: zones.id,
      ineCode: locations.ineCode,
      municipality: locations.municipality,
      state: zones.state,
      longitude: sql<number | null>`ST_X(${locations.centroid}::geometry)`,
      latitude: sql<number | null>`ST_Y(${locations.centroid}::geometry)`,
      sweepRadiusM: locations.sweepRadiusM,
    })
    .from(zones)
    .innerJoin(locations, eq(zones.locationId, locations.id))
    .where(eq(zones.id, zoneId));

  if (!row) {
    return null;
  }

  return {
    zoneId: row.zoneId,
    ineCode: row.ineCode,
    municipality: row.municipality,
    state: row.state,
    centroid:
      row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
    sweepRadiusM: row.sweepRadiusM,
  };
}

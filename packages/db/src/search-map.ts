// ROADMAP 2.6 (decisión 117, refina la 058) — puntos del mapa. Misma consulta
// filtrada y MISMO ORDER BY que la lista (índices de la decisión 100), más
// `location IS NOT NULL`: el mapa solo pinta viviendas con coordenadas.
// Zod-free (decisión 023).
import { and, asc, count, sql } from 'drizzle-orm';
import type { PropertySearchCriteria } from '@buscahogar/core';

import type { Database } from './db.js';
import { anchorListingId, sortOrder } from './search.js';
import { buildFilters } from './search-filters.js';
import { properties } from './tables.js';

// Máximo de puntos devueltos. Constante de servidor, nunca de URL.
export const MAP_POINT_CAP = 500;

export interface MapPoint {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly minPriceCents: number | null;
  readonly anchorListingId: string | null;
}

export interface MapPointsResult {
  readonly points: readonly MapPoint[];
  // M: viviendas MAPEABLES que coinciden (con ubicación), no el total de la lista.
  readonly total: number;
  readonly truncated: boolean;
}

// Predicados idénticos a la lista + ubicación no nula. Compartido por la
// consulta de puntos y la de recuento para que M cuente exactamente lo mismo.
function mapFilters(criteria: PropertySearchCriteria): ReturnType<typeof buildFilters> {
  return [...buildFilters(criteria), sql`"properties"."location" IS NOT NULL`];
}

// Exportada por la misma razón que `buildPropertySearchQuery`: el test
// inspecciona `.toSQL()` de la consulta que se ejecuta. `page` se ignora.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildMapPointsQuery(db: Database, criteria: PropertySearchCriteria) {
  return db
    .select({
      id: properties.id,
      lat: sql<number>`ST_Y("properties"."location")`.mapWith(Number),
      lon: sql<number>`ST_X("properties"."location")`.mapWith(Number),
      minPriceCents: properties.minPriceCents,
      anchorListingId,
    })
    .from(properties)
    .where(and(...mapFilters(criteria)))
    .orderBy(sortOrder(criteria), asc(properties.id))
    // Se piden CAP + 1 filas: la 501 solo señala truncado y se descarta.
    .limit(MAP_POINT_CAP + 1);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildMapCountQuery(db: Database, criteria: PropertySearchCriteria) {
  return db
    .select({ total: count() })
    .from(properties)
    .where(and(...mapFilters(criteria)));
}

// El recuento corre en su propia sentencia, sin instantánea compartida con la
// consulta de puntos: si la ingesta desactiva viviendas entre ambas, puede
// quedar por debajo de las CAP + 1 filas ya leídas. Con truncado, M nunca baja
// de CAP + 1.
export function truncatedMapTotal(counted: number | undefined): number {
  return Math.max(counted ?? 0, MAP_POINT_CAP + 1);
}

// Con CAP o menos filas M = N y no hay segunda consulta; con CAP + 1 filas se
// ejecuta `count(*)` con el WHERE idéntico (decisión 117; `COUNT(*) OVER()`
// rechazado en la 058).
export async function searchMapPoints(db: Database, criteria: PropertySearchCriteria): Promise<MapPointsResult> {
  const rows = await buildMapPointsQuery(db, criteria);
  if (rows.length <= MAP_POINT_CAP) {
    return { points: rows, total: rows.length, truncated: false };
  }
  const [counted] = await buildMapCountQuery(db, criteria);
  return { points: rows.slice(0, MAP_POINT_CAP), total: truncatedMapTotal(counted?.total), truncated: true };
}

// ROADMAP 2.6 (decisión 117, refina la 058) — filtros de búsqueda compartidos
// por la consulta de lista (`search.ts`) y la de mapa (`search-map.ts`). Un
// único constructor garantiza que ambas vistas devuelven el MISMO conjunto de
// viviendas. Movido sin cambios desde `search.ts`, salvo el predicado de
// polígono. Zod-free (decisión 023): solo importa tipos de `@buscahogar/core`.
import { eq, gte, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PropertySearchCriteria } from '@buscahogar/core';

import { pointWithinMeters, polygonCovers } from './spatial.js';
import { properties } from './tables.js';

export function buildFilters(criteria: PropertySearchCriteria): SQL[] {
  // ROADMAP 2.5 (decisión 109): una vivienda solo es visible si tiene al menos
  // un anuncio ACTIVO. Es un predicado sobre la caché de `properties`
  // (`active_listing_count`, mantenida por `refreshPropertyVisibility`), nunca
  // un join a `listings`: así siguen valiendo los planes medidos de la
  // decisión 100. Literal `0` a propósito (no parámetro ligado), para que el
  // planificador lo vea como constante. Va siempre el primero.
  const filters: SQL[] = [sql`${properties.activeListingCount} > 0`];

  // Regla NULL (A-2, decisión 058): un filtro AUSENTE no añade ningún
  // predicado (la fila entra con independencia de esa columna); un filtro
  // ACTIVO excluye cualquier fila NULL en su columna por la lógica
  // trivaluada de SQL — deliberadamente SIN la rama `OR … IS NULL` que
  // `blocking.ts` (D-Q3) sí añade para su propio caso de uso.
  if (criteria.operation !== undefined) {
    filters.push(eq(properties.operation, criteria.operation));
  }
  if (criteria.propertyType !== undefined) {
    filters.push(eq(properties.propertyType, criteria.propertyType));
  }
  if (criteria.minPriceCents !== undefined) {
    filters.push(gte(properties.minPriceCents, criteria.minPriceCents));
  }
  if (criteria.maxPriceCents !== undefined) {
    filters.push(lte(properties.minPriceCents, criteria.maxPriceCents));
  }
  if (criteria.minSurfaceM2 !== undefined) {
    filters.push(gte(properties.surfaceM2, criteria.minSurfaceM2));
  }
  if (criteria.maxSurfaceM2 !== undefined) {
    filters.push(lte(properties.surfaceM2, criteria.maxSurfaceM2));
  }
  // "Al menos N habitaciones/baños" (umbral mínimo, spec confirmada contra
  // D3): gte, nunca igualdad exacta.
  if (criteria.minRooms !== undefined) {
    filters.push(gte(properties.rooms, criteria.minRooms));
  }
  if (criteria.minBathrooms !== undefined) {
    filters.push(gte(properties.bathrooms, criteria.minBathrooms));
  }
  if (criteria.geo !== undefined) {
    filters.push(pointWithinMeters(properties.locationGeography, criteria.geo.lon, criteria.geo.lat, criteria.geo.radiusMeters));
  }
  // ROADMAP 2.6 (decisión 116): polígono dibujado. Excluyente con `geo` (lo
  // garantiza el esquema de core), por eso no hay rama de combinación. Un
  // predicado ausente no añade nada: sin polígono el SQL es idéntico al previo.
  if (criteria.polygon !== undefined) {
    filters.push(polygonCovers(properties.locationGeography, criteria.polygon));
  }

  return filters;
}

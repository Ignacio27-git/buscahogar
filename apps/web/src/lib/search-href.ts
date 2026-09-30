// ROADMAP 2.6 (decisión 118) — constructores de href puros de la búsqueda.
// Todos conservan los demás parámetros de la URL (los filtros viven en la
// URL) y reinician `page`: la vista de mapa no pagina y una zona nueva es un
// conjunto de resultados distinto.
import { formatPolygonParam } from '@buscahogar/core';
import type { PolygonRing } from '@buscahogar/core';

export type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>;

// Copia los parámetros, saltando las claves indicadas. Las claves repetidas se
// conservan todas (la validación de un escalar repetido es asunto del esquema).
function copyParams(params: RawSearchParams, omit: ReadonlySet<string>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (omit.has(key) || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        query.append(key, entry);
      }
    } else {
      query.append(key, value);
    }
  }
  return query;
}

// SMV-1: alternar la vista conserva todo salvo `page`. Lista = `view` ausente.
export function buildViewHref(params: RawSearchParams, view: 'list' | 'map'): string {
  const query = copyParams(params, new Set(['page', 'view']));
  if (view === 'map') {
    query.set('view', 'map');
  }
  return `/?${query.toString()}`;
}

// SMV-8: cerrar un polígono conserva los filtros y `view=map`, y descarta
// `page` y toda restricción geográfica previa (zona, radio) para que la URL
// nueva sea válida (DAS-8). Un polígono nuevo reemplaza al anterior.
const DRAWN_AREA_OMIT: ReadonlySet<string> = new Set([
  'page',
  'view',
  'polygon',
  'zone',
  'zoneQuery',
  'lat',
  'lng',
  'radius',
]);

export function buildDrawnAreaHref(params: RawSearchParams, ring: PolygonRing): string {
  const query = copyParams(params, DRAWN_AREA_OMIT);
  query.set('view', 'map');
  query.set('polygon', formatPolygonParam(ring));
  return `/?${query.toString()}`;
}

// SMV-8 "Quitar zona": quita `polygon` y `page`, conserva el resto.
export function buildClearAreaHref(params: RawSearchParams): string {
  const query = copyParams(params, new Set(['polygon', 'page']));
  return `/?${query.toString()}`;
}

// ROADMAP 1.13 Unit D (DD-19), ampliado en 2.6: el enlace de cada sugerencia
// sustituye `zoneQuery` por `zone=<ineCode>`, reinicia `page` y, como `zone`
// y `polygon` son excluyentes, descarta también `polygon`.
export function buildZoneSelectionHref(params: RawSearchParams, ineCode: string): string {
  const query = copyParams(params, new Set(['page', 'zoneQuery', 'zone', 'polygon']));
  query.set('zone', ineCode);
  return `/?${query.toString()}`;
}

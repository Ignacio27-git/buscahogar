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

// D.6a: las construcciones nuevas devuelven `/` cuando no queda ningún
// parámetro (no `/?`). Los constructores anteriores conservan su salida.
export function toHref(query: URLSearchParams): string {
  const text = query.toString();
  return text === '' ? '/' : `/?${text}`;
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

// ROADMAP 3.1 (decisión 123) — el formulario de criterios de `?q=` envía un
// campo oculto `form=criteria`. Un GET HTML manda TODOS los campos, también los
// vacíos (`minPrice=`), y el esquema rechaza con nombre un importe vacío
// (decisión 057): la página quita la marca y los valores en blanco ANTES de
// validar. Sin la marca no se toca nada, así que `?minPrice=` escrito a mano
// sigue recibiendo su rechazo nombrado. Funciona sin JavaScript y sin ninguna
// redirección del servidor; todos los constructores de href reciben ya los parámetros
// limpios, así que la marca nunca se arrastra.
export const CRITERIA_FORM_MARKER = 'criteria';

export function canonicalizeFormSubmission(params: RawSearchParams): RawSearchParams {
  if (params.form !== CRITERIA_FORM_MARKER) {
    return params;
  }
  const cleaned: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'form' || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      const kept = value.filter((entry) => entry.trim() !== '');
      if (kept.length > 0) {
        cleaned[key] = kept;
      }
    } else if (value.trim() !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// D.6a (decisión 151) — filtros aplicados que la página pinta como enlaces
// «Quitar …». Cada uno nombra el grupo de claves de URL que lo expresa; el
// filtro geográfico es uno solo porque el esquema exige lat/lng/radius juntos.
export type AppliedFilterKey =
  | 'operation'
  | 'propertyType'
  | 'minPrice'
  | 'maxPrice'
  | 'minSurface'
  | 'maxSurface'
  | 'minRooms'
  | 'minBathrooms'
  | 'zone'
  | 'polygon'
  | 'geo';

export const FILTER_PARAM_KEYS: Readonly<Record<AppliedFilterKey, readonly string[]>> = {
  operation: ['operation'],
  propertyType: ['propertyType'],
  minPrice: ['minPrice'],
  maxPrice: ['maxPrice'],
  minSurface: ['minSurface'],
  maxSurface: ['maxSurface'],
  minRooms: ['minRooms'],
  minBathrooms: ['minBathrooms'],
  zone: ['zone'],
  polygon: ['polygon'],
  geo: ['lat', 'lng', 'radius'],
};

// Estado que la barra de filtros reenvía en campos ocultos para no perderlo al
// enviar. `page` queda fuera a propósito: con otros filtros la página N pierde
// su sentido.
export const FILTER_BAR_CONTEXT_KEYS = ['view', 'polygon', 'zone', 'lat', 'lng', 'radius', 'zoneQuery'] as const;

const GEO_KEYS: readonly string[] = FILTER_PARAM_KEYS.geo;

// Quitar un filtro descarta su grupo de claves y `page`, y conserva el resto.
export function buildRemoveFilterHref(params: RawSearchParams, filter: AppliedFilterKey): string {
  return toHref(copyParams(params, new Set([...FILTER_PARAM_KEYS[filter], 'page'])));
}

// «Quitar todos»: conserva solo la vista y la ordenación.
const KEPT_ON_CLEAR = ['view', 'sort', 'dir'] as const;

// D.14 (N2) — claves extra que el estado vacío puede conservar: la zona sin aplicar (D10) y el
// polígono sin viviendas (D13) explican el vacío, así que «Quitar los demás filtros» no los borra.
// La barra de filtros aplicados llama sin opciones y sigue quitándolos.
export type ClearKeepKey = 'polygon' | 'zone' | 'zoneQuery';

export function buildClearFiltersHref(
  params: RawSearchParams,
  options: { readonly keep?: readonly ClearKeepKey[] } = {}
): string {
  const query = new URLSearchParams();
  for (const key of [...KEPT_ON_CLEAR, ...(options.keep ?? [])]) {
    const value = params[key];
    if (value !== undefined) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        query.append(key, entry);
      }
    }
  }
  return toHref(query);
}

// Campos ocultos de la barra: solo valores escalares, sin las claves que el
// esquema rechazó (un oculto rechazado dejaría la barra sin salida). Si se
// rechaza una de lat/lng/radius se omiten las tres, igual que se quitan juntas.
export function pickFilterBarContext(
  params: RawSearchParams,
  rejected: ReadonlySet<string> = new Set()
): readonly (readonly [string, string])[] {
  const geoRejected = GEO_KEYS.some((key) => rejected.has(key));
  const pairs: (readonly [string, string])[] = [];
  for (const key of FILTER_BAR_CONTEXT_KEYS) {
    const value = params[key];
    if (typeof value !== 'string' || rejected.has(key) || (geoRejected && GEO_KEYS.includes(key))) {
      continue;
    }
    pairs.push([key, value]);
  }
  return pairs;
}

// Movidos desde la página (ROADMAP 1.13 Unit D): misma salida que antes.
export function buildPageHref(params: RawSearchParams, targetPage: number): string {
  const query = copyParams(params, new Set(['page']));
  query.set('page', String(targetPage));
  return `/?${query.toString()}`;
}

// D.14 — «Ir a la primera página» del estado vacío: conserva los filtros y quita `page`.
export function buildFirstPageHref(params: RawSearchParams): string {
  return toHref(copyParams(params, new Set(['page'])));
}

// Enlace de recarga PLANO: la misma URL actual, un `href` real, sin JavaScript.
export function buildCurrentHref(params: RawSearchParams): string {
  return `/?${copyParams(params, new Set()).toString()}`;
}

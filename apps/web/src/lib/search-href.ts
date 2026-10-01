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

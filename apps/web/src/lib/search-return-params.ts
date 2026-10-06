// D.9 (decisión 171) — selección, en lista blanca, de los parámetros de la
// búsqueda que viajan en el enlace a la ficha. Función pura y SIN esquemas:
// la importa `MapClusterLayer` (código de cliente), así que no puede arrastrar
// Zod ni los esquemas del núcleo. Solo depende de `search-href.ts`, que ya está
// en el bundle del mapa. La validación va en `search-return.ts` (servidor).
import { FILTER_PARAM_KEYS } from './search-href';
import type { RawSearchParams } from './search-href';

export type SearchReturnParams = readonly (readonly [string, string])[];

// Orden canónico: las claves de filtro (derivadas de `FILTER_PARAM_KEYS`, no
// copiadas), la ordenación y la vista. Nunca `q`, `form` ni `zoneQuery`.
export const RETURN_KEYS: readonly string[] = [...Object.values(FILTER_PARAM_KEYS).flat(), 'sort', 'dir', 'view'];

// `page` solo viaja desde las filas de la lista: el mapa no pagina.
export function pickSearchReturnParams(
  params: RawSearchParams,
  options: { readonly includePage: boolean }
): SearchReturnParams {
  const keys = options.includePage ? [...RETURN_KEYS, 'page'] : RETURN_KEYS;
  const pairs: (readonly [string, string])[] = [];
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string') {
      pairs.push([key, value]);
    }
  }
  return pairs;
}

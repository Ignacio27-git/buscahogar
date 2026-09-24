// Paso 1.6 — construcción de la petición de búsqueda (diseño, "Data flow",
// paso 5). Puro: nunca toca la red.
import type { AreaQuery } from '@buscahogar/core';

import type { IdealistaFilter } from './filters.js';

export interface SearchField {
  readonly name: string;
  readonly value: string;
}

const DEFAULT_MAX_ITEMS_PER_PAGE = 50;

// `propertyType` de la petición usa el vocabulario de la TUPLA congelada de
// filtros (homes/offices/premises/garages/bedrooms), que es distinto del
// vocabulario de la RESPUESTA (flat/duplex/penthouse/premise/…, DECISIONS
// 027) — nunca se mezclan. El nombre del filtro ES literalmente el valor
// enviado.
export function buildSearchFields(
  area: AreaQuery,
  filter: IdealistaFilter,
  page: number,
  maxItemsPerPage: number = DEFAULT_MAX_ITEMS_PER_PAGE
): readonly SearchField[] {
  return [
    { name: 'center', value: `${String(area.center.latitude)},${String(area.center.longitude)}` },
    { name: 'distance', value: String(Math.round(area.radiusMeters)) },
    { name: 'propertyType', value: filter },
    { name: 'operation', value: area.operation },
    { name: 'maxItems', value: String(maxItemsPerPage) },
    { name: 'numPage', value: String(page) },
  ];
}

// Misma iteración permitida en D6 (extendido del paso 1.5): el ban de
// bucles de ESLint no alcanza a este fichero, solo a http-client.ts e
// idealista-source.ts — los dos únicos ficheros que pueden emitir una
// petición.
export function toFormData(fields: readonly SearchField[]): FormData {
  const formData = new FormData();
  for (const field of fields) {
    formData.append(field.name, field.value);
  }
  return formData;
}

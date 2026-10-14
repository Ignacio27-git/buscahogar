// D.14 (decisión 190) — qué explica una sección sin resultados. Lógica pura, sin Next ni ORM.
//
// El aviso de cobertura (zona sin datos o polígono sin viviendas) es la única explicación de su
// causa; aquí solo se decide qué guía añade el estado vacío además de él, y sobre qué filtros.
// D.18 (decisión 224): la zona con centroide y radio siempre se aplica, así que es un filtro más y
// solo el polígono vacío se acota.
import type { ClearKeepKey } from '@/lib/search-href';
import type { AppliedFilter } from '@/lib/search-labels';

export type EmptyResultsKind = 'filtered' | 'unfiltered' | 'past-last-page';

export interface ScopedEmptyResultsFilters {
  readonly filters: readonly AppliedFilter[];
  // Claves que «Quitar los demás filtros» debe conservar porque el aviso de cobertura las explica.
  readonly keepOnClear: readonly ClearKeepKey[];
}

// Quita lo que no es un arreglo: quitar «Zona dibujada» vacía no cambiaría el resultado, y
// contradiría el aviso. Se llama una vez en la página y se comparte con la lista y con el mapa.
export function scopeEmptyResultsFilters(input: {
  readonly filters: readonly AppliedFilter[];
  readonly polygonEmpty: boolean;
}): ScopedEmptyResultsFilters {
  if (!input.polygonEmpty) return { filters: input.filters, keepOnClear: [] };
  return { filters: input.filters.filter((filter) => filter.key !== 'polygon'), keepOnClear: ['polygon'] };
}

// Precedencia explícita. `filters` ya viene acotado por `scopeEmptyResultsFilters`.
// 1. Polígono sin viviendas: con otros filtros, `filtered`; solo, `null` (basta el aviso). No
//    depende de `page`: con total 0 «Ir a la primera página» no ayudaría.
// 2. `page > 1`: `past-last-page`. 3. Con filtros: `filtered`. 4. Si no: `unfiltered`.
export function selectEmptyResultsKind(input: {
  readonly page: number;
  readonly polygonEmpty: boolean;
  readonly filters: readonly AppliedFilter[];
}): EmptyResultsKind | null {
  if (input.polygonEmpty) return input.filters.length > 0 ? 'filtered' : null;
  if (input.page > 1) return 'past-last-page';
  return input.filters.length > 0 ? 'filtered' : 'unfiltered';
}

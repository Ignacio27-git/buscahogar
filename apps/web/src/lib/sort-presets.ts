// D.18 (decisión 227, C-9) — ordenaciones predefinidas de la búsqueda. Lógica pura, sin Next ni ORM.
//
// Sustituyen a los dos desplegables «Ordenar por» y «Sentido»: cada preset es un par sort/dir del
// esquema (`search-query.schema.ts`: sort ∈ price|surface|updated, dir ∈ asc|desc, por defecto
// updated/desc). Los rótulos son los acordados con la persona usuaria, literales.
export type SortPresetId = 'recent' | 'price-asc' | 'price-desc' | 'surface-desc' | 'surface-asc';

export interface SortPreset {
  readonly id: SortPresetId;
  readonly label: string;
  readonly sort: 'updated' | 'price' | 'surface';
  readonly dir: 'asc' | 'desc';
}

export const SORT_PRESETS: readonly SortPreset[] = [
  { id: 'recent', label: 'Más recientes', sort: 'updated', dir: 'desc' },
  { id: 'price-asc', label: 'Precio: de menor a mayor', sort: 'price', dir: 'asc' },
  { id: 'price-desc', label: 'Precio: de mayor a menor', sort: 'price', dir: 'desc' },
  { id: 'surface-desc', label: 'Superficie: de mayor a menor', sort: 'surface', dir: 'desc' },
  { id: 'surface-asc', label: 'Superficie: de menor a mayor', sort: 'surface', dir: 'asc' },
];

// El predefinido coincide con el valor por defecto del esquema, así que su enlace no lleva sort ni dir.
export const DEFAULT_SORT_PRESET: SortPreset = SORT_PRESETS[0] as SortPreset;

const DEFAULT_DIR = 'desc';
const DEFAULT_SORT = 'updated';

export function sortPresetById(id: string): SortPreset | undefined {
  return SORT_PRESETS.find((preset) => preset.id === id);
}

// El preset de un par sort/dir tal como llega (ausentes = valores por defecto del esquema). Una
// combinación sin preset (p. ej. updated/asc) devuelve `undefined`: ningún enlace queda activo.
export function sortPresetFor(sort: string | undefined, dir: string | undefined): SortPreset | undefined {
  const effectiveSort = sort ?? DEFAULT_SORT;
  const effectiveDir = dir ?? DEFAULT_DIR;
  return SORT_PRESETS.find((preset) => preset.sort === effectiveSort && preset.dir === effectiveDir);
}

// D.18 (decisión 227, C-9) — ordenación como enlaces predefinidos junto al recuento. Server
// Component puro, sin `'use client'`: cada preset es un `<a href>` real (`buildSortHref`), así que
// funciona sin JavaScript. El vigente lleva `aria-current="true"`; una combinación sin preset
// (p. ej. updated/asc en la URL) no marca ninguno: como mucho uno activo, no exactamente uno.
import type { ReactElement } from 'react';

import { buildSortHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';
import { SORT_PRESETS, sortPresetFor } from '@/lib/sort-presets';

export interface SortPresetsProps {
  readonly params: RawSearchParams;
  // Valores efectivos de la búsqueda (con los por defecto del esquema ya aplicados).
  readonly sort: string;
  readonly dir: string;
}

const LABEL_ID = 'sort-presets-label';

export function SortPresets({ params, sort, dir }: SortPresetsProps): ReactElement {
  const active = sortPresetFor(sort, dir);
  return (
    <div className="sort-presets">
      <p id={LABEL_ID}>Ordenar por</p>
      <ul aria-labelledby={LABEL_ID} className="sort-presets__list">
        {SORT_PRESETS.map((preset) => (
          <li key={preset.id}>
            <a
              href={buildSortHref(params, preset)}
              className="sort-presets__link"
              {...(active?.id === preset.id ? { 'aria-current': 'true' as const } : {})}
            >
              {preset.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

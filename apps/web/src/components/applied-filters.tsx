// D.6a (decisión 151) — fila de resumen de la home: el recuento y, si hay filtros,
// un enlace «Quitar …» por filtro (más «Quitar todos» con dos o más). Server
// Component puro: cada enlace es un `href` real, así que funciona sin JavaScript.
// El recuento se pinta siempre, también con 0 resultados.
//
// La lista lleva `relative`: el texto `sr-only` de cada enlace es `position: absolute`
// y, sin un bloque contenedor dentro del desplazamiento, escaparía del recorte y
// ensancharía el documento (desbordamiento horizontal a 320px).
import type { ReactElement } from 'react';

import type { PropertySearchCriteria } from '@buscahogar/core';

import { buildClearFiltersHref, buildRemoveFilterHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';
import { describeAppliedFilters } from '@/lib/search-labels';

export interface AppliedFiltersProps {
  // `criteria`, nunca `effectiveCriteria`: esta añade un `geo` derivado de la zona.
  readonly criteria: PropertySearchCriteria;
  readonly params: RawSearchParams;
  readonly zoneName: string | null;
  // Texto del recuento, ya formateado (`formatListCount` / `formatMapCount`).
  readonly count: string;
}

const CLEAR_ALL_THRESHOLD = 2;

export function AppliedFilters({ criteria, params, zoneName, count }: AppliedFiltersProps): ReactElement {
  const filters = describeAppliedFilters(criteria, zoneName);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="font-semibold tabular-nums">{count}</p>
      {filters.length > 0 ? (
        <section aria-label="Filtros aplicados" className="flex min-w-0 flex-1">
          <ul className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain p-1 sm:flex-wrap sm:overflow-visible">
            {filters.map((filter) => (
              <li key={filter.key} className="shrink-0">
                <a
                  href={buildRemoveFilterHref(params, filter.key)}
                  className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-control border border-rule-control bg-surface-raised px-3 text-dense text-ink no-underline hover:border-ink"
                >
                  <span className="sr-only">Quitar filtro: </span>
                  {filter.label}
                  <span aria-hidden="true" className="text-ink-muted">
                    ×
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {filters.length >= CLEAR_ALL_THRESHOLD ? (
        <a href={buildClearFiltersHref(params)} className="inline-flex min-h-8 shrink-0 items-center">
          Quitar todos<span className="sr-only"> los filtros</span>
        </a>
      ) : null}
    </div>
  );
}

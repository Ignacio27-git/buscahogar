// D.6a (decisión 151) — fila de resumen de la home: el recuento y, si hay filtros,
// un enlace «Quitar …» por filtro (más «Quitar todos» con dos o más). Server
// Component puro: cada enlace es un `href` real, así que funciona sin JavaScript.
// El recuento se pinta siempre, también con 0 resultados.
//
// P5 (pulido de D.21): la fila no pasa de 48rem (la columna de la lista, `.applied-filters` en el CSS),
// así «Quitar todos» queda al final de la fila de chips y no flota sobre el mapa; la lista no lleva relleno
// (los chips empiezan en el margen) y el recuento y el enlace se alinean arriba, con la primera fila.
//
// La lista envuelve (D.13b): los chips pasan a la línea siguiente en vez de desplazarse en
// horizontal, y un chip más ancho que la fila se parte dentro de sí mismo. Lleva `relative`
// porque el texto `sr-only` de cada enlace es `position: absolute` y no debe ensanchar el documento.
import type { ReactElement } from 'react';

import type { PropertySearchCriteria } from '@buscahogar/core';

import { buildClearFiltersHref, buildRemoveFilterHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';
import { describeAppliedFilters } from '@/lib/search-labels';

import { Icon } from './icon';

export interface AppliedFiltersProps {
  // `criteria`, nunca `effectiveCriteria`: esta añade un `geo` derivado de la zona.
  readonly criteria: PropertySearchCriteria;
  readonly params: RawSearchParams;
  readonly zoneName: string | null;
  // Texto del recuento, ya formateado (`formatListCount` / `formatMapCount`).
  readonly count: string;
}

// «Quitar todos» aparece desde dos filtros. D.18 (decisión 225): el umbral es privado; el estado
// vacío pregunta por `offersClearAll`.
const CLEAR_ALL_THRESHOLD = 2;

// La fila de chips ofrece «Quitar todos» desde dos filtros. El estado vacío lo consulta para no
// repetir un enlace de limpieza idéntico (refinamiento de C-11 tras el gate G-D).
export function offersClearAll(filterCount: number): boolean {
  return filterCount >= CLEAR_ALL_THRESHOLD;
}

// D.7 (decisión 159) — forma común del chip interactivo y del de solo lectura. El
// interactivo debe seguir produciendo, byte a byte, la clase de D.6a (lo fija un test).
const CHIP_SHAPE = 'inline-flex min-h-8 max-w-full items-center gap-1 rounded-control [overflow-wrap:anywhere]';

export function AppliedFilters({ criteria, params, zoneName, count }: AppliedFiltersProps): ReactElement {
  const filters = describeAppliedFilters(criteria, zoneName);
  return (
    <div className="applied-filters flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <p className="applied-filters__count font-semibold tabular-nums">{count}</p>
      {filters.length > 0 ? (
        <section aria-label="Filtros aplicados" className="flex min-w-0 flex-1">
          <ul className="relative flex min-w-0 flex-1 flex-wrap gap-2">
            {filters.map((filter) => (
              <li key={filter.key} className="min-w-0 max-w-full">
                <a
                  href={buildRemoveFilterHref(params, filter.key)}
                  className={`${CHIP_SHAPE} border border-rule-control bg-accent-wash px-3 text-dense text-ink no-underline applied-filters__chip`}
                >
                  <span className="sr-only">Quitar filtro: </span>
                  {filter.label}
                  <Icon name="close" className="text-ink-muted" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {offersClearAll(filters.length) ? (
        <a href={buildClearFiltersHref(params)} className="applied-filters__clear inline-flex min-h-8 shrink-0 items-center">
          Quitar todos<span className="sr-only"> los filtros</span>
        </a>
      ) : null}
    </div>
  );
}

export interface AppliedFiltersSummaryProps {
  readonly criteria: PropertySearchCriteria;
  readonly zoneName: string | null;
}

// D.7 (decisión 159) — resumen de solo lectura de lo interpretado en `?q=`: los
// mismos rótulos que los chips, pero sin enlaces, sin recuento y sin «Quitar
// todos» (los filtros aún no se han aplicado). Sin borde: se lee como etiqueta,
// no como control. No pinta nada si no hay filtros.
export function AppliedFiltersSummary({ criteria, zoneName }: AppliedFiltersSummaryProps): ReactElement | null {
  const filters = describeAppliedFilters(criteria, zoneName);
  if (filters.length === 0) return null;
  return (
    <section aria-label="Filtros interpretados">
      <ul className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <li key={filter.key}>
            <span className={`${CHIP_SHAPE} bg-surface-sunken px-3 text-dense text-ink`}>{filter.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

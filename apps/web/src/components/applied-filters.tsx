// D.6a (decisión 151) — fila de resumen de la home: el recuento y, si hay filtros,
// un enlace «Quitar …» por filtro (más «Quitar todos» con dos o más). Server
// Component puro: cada enlace es un `href` real, así que funciona sin JavaScript.
// El recuento se pinta siempre, también con 0 resultados.
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
  // D.17 (B1): `false` si la zona del criterio no se aplicó (aún sin datos); su chip lo dice.
  readonly zoneApplied?: boolean;
}

// Exportado: el estado vacío (D.14) usa el mismo umbral para ofrecer «Quitar los demás filtros».
export const CLEAR_ALL_THRESHOLD = 2;

// D.7 (decisión 159) — forma común del chip interactivo y del de solo lectura. El
// interactivo debe seguir produciendo, byte a byte, la clase de D.6a (lo fija un test).
const CHIP_SHAPE = 'inline-flex min-h-8 max-w-full items-center gap-1 rounded-control [overflow-wrap:anywhere]';

export function AppliedFilters({ criteria, params, zoneName, count, zoneApplied = true }: AppliedFiltersProps): ReactElement {
  const filters = describeAppliedFilters(criteria, zoneName, { zoneApplied });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="font-semibold tabular-nums">{count}</p>
      {filters.length > 0 ? (
        <section aria-label="Filtros aplicados" className="flex min-w-0 flex-1">
          <ul className="relative flex min-w-0 flex-1 flex-wrap gap-2 p-1">
            {filters.map((filter) => (
              <li key={filter.key} className="min-w-0 max-w-full">
                <a
                  href={buildRemoveFilterHref(params, filter.key)}
                  className={`${CHIP_SHAPE} border border-rule-control bg-surface-raised px-3 text-dense text-ink no-underline applied-filters__chip`}
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
      {filters.length >= CLEAR_ALL_THRESHOLD ? (
        <a href={buildClearFiltersHref(params)} className="inline-flex min-h-8 shrink-0 items-center">
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

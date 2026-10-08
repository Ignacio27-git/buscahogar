// D.14 (decisión 190) — estado vacío de la lista y del mapa, en tres tipos. Server Component
// puro: cada acción es un `href` real, así que funciona sin JavaScript.
//
// Sin rol vivo: el aviso de cobertura es la única región `status`/`alert` (decisión 160) y este
// bloque nunca nombra la causa. Recibe los filtros YA acotados (`scopeEmptyResultsFilters`), de
// modo que nunca ofrece quitar el polígono vacío ni una zona que no se aplicó.
import type { ReactElement } from 'react';

import { CLEAR_ALL_THRESHOLD } from '@/components/applied-filters';
import type { EmptyResultsKind } from '@/lib/empty-results';
import { buildClearFiltersHref, buildFirstPageHref, buildRemoveFilterHref } from '@/lib/search-href';
import type { ClearKeepKey, RawSearchParams } from '@/lib/search-href';
import type { AppliedFilter } from '@/lib/search-labels';

export interface EmptyResultsProps {
  readonly kind: EmptyResultsKind;
  readonly params: RawSearchParams;
  readonly filters: readonly AppliedFilter[];
  readonly keepOnClear: readonly ClearKeepKey[];
}

function Panel({
  title,
  detail,
  children,
}: {
  readonly title: string;
  readonly detail: string;
  readonly children?: ReactElement;
}): ReactElement {
  return (
    <div className="empty-results">
      <p className="empty-results__title">{title}</p>
      <p className="empty-results__detail">{detail}</p>
      {children}
    </div>
  );
}

export function EmptyResults({ kind, params, filters, keepOnClear }: EmptyResultsProps): ReactElement {
  if (kind === 'unfiltered') {
    return (
      <Panel
        title="Todavía no hay viviendas."
        detail="Aquí verás las viviendas de los portales en cuanto las incorporemos. Vuelve a buscar más tarde."
      />
    );
  }
  if (kind === 'past-last-page') {
    return (
      <Panel
        title="Esta página ya no tiene viviendas."
        detail="Los resultados de tu búsqueda terminan antes de esta página."
      >
        <ul className="empty-results__actions">
          <li>
            <a href={buildFirstPageHref(params)}>Ir a la primera página</a>
          </li>
        </ul>
      </Panel>
    );
  }
  // WCAG 3.2.4: dos enlaces con el mismo nombre deben llevar al mismo sitio. El de la barra de
  // filtros quita también el polígono o la zona; si este los conserva, se llama distinto.
  const clearName = keepOnClear.length > 0 ? 'Quitar los demás filtros' : 'Quitar todos los filtros';
  return (
    <Panel title="Ninguna vivienda coincide con tu búsqueda." detail="Prueba a quitar alguno de estos filtros:">
      <ul className="empty-results__actions">
        {filters.map((filter) => (
          <li key={filter.key}>
            <a href={buildRemoveFilterHref(params, filter.key)}>Quitar «{filter.label}»</a>
          </li>
        ))}
        {filters.length >= CLEAR_ALL_THRESHOLD ? (
          <li>
            <a href={buildClearFiltersHref(params, { keep: keepOnClear })}>{clearName}</a>
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}

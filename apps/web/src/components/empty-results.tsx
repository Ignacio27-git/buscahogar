// D.14 (decisión 190) y D.18 (decisión 225) — estado vacío de la lista y del mapa, en tres tipos.
// Server Component puro: cada acción es un `href` real, así que funciona sin JavaScript.
//
// Sin rol vivo: el aviso de cobertura es la única región `status`/`alert` (decisión 160) y este
// bloque nunca nombra la causa. El vacío filtrado no repite los chips (C-11): estado, una frase que
// remite a los chips de arriba y UNA acción siempre visible. Los filtros ya acotados
// (`scopeEmptyResultsFilters`) solo deciden el tipo; aquí basta saber si hay algo que conservar.
import type { ReactElement } from 'react';

import type { EmptyResultsKind } from '@/lib/empty-results';
import { buildClearFiltersHref, buildFirstPageHref } from '@/lib/search-href';
import type { ClearKeepKey, RawSearchParams } from '@/lib/search-href';

export interface EmptyResultsProps {
  readonly kind: EmptyResultsKind;
  readonly params: RawSearchParams;
  readonly keepOnClear: readonly ClearKeepKey[];
  // `true` si la fila de chips ya ofrece «Quitar todos»: el vacío filtrado no repite un enlace
  // idéntico. Con algo que conservar (polígono) la acción es distinta y se muestra siempre.
  readonly clearAllOffered?: boolean;
}

function Panel({
  title,
  detail,
  children,
}: {
  readonly title: string;
  readonly detail: string;
  readonly children?: ReactElement | null;
}): ReactElement {
  return (
    <div className="empty-results">
      <p className="empty-results__title">{title}</p>
      <p className="empty-results__detail">{detail}</p>
      {children}
    </div>
  );
}

export function EmptyResults({ kind, params, keepOnClear, clearAllOffered = false }: EmptyResultsProps): ReactElement {
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
        <p className="empty-results__action">
          <a href={buildFirstPageHref(params)}>Ir a la primera página</a>
        </p>
      </Panel>
    );
  }
  // WCAG 3.2.4: dos enlaces con el mismo nombre deben llevar al mismo sitio. El de la fila de chips
  // quita también el polígono; si este lo conserva, se llama distinto.
  const clearName = keepOnClear.length > 0 ? 'Quitar los demás filtros' : 'Quitar todos los filtros';
  const showAction = keepOnClear.length > 0 || !clearAllOffered;
  return (
    <Panel
      title="Ninguna vivienda coincide con tu búsqueda."
      detail="Los filtros aplicados están arriba; pulsa uno para quitarlo."
    >
      {showAction ? (
        <p className="empty-results__action">
          <a href={buildClearFiltersHref(params, { keep: keepOnClear })}>{clearName}</a>
        </p>
      ) : null}
    </Panel>
  );
}

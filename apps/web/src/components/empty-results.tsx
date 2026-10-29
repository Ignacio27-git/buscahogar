// D.14 (decisión 190), D.18 (decisión 225) y D.22 (decisión 269) — estado vacío de la lista y del mapa, en tres
// tipos. Server Component puro: cada acción es un `href` real, así que funciona sin JavaScript.
//
// Sin rol vivo: el aviso de cobertura es la única región `status`/`alert` (decisión 160) y este
// bloque nunca nombra la causa. El vacío filtrado no repite los chips (C-11): ilustración, estado, una frase
// cálida que remite a los chips de arriba y UNA acción principal, siempre visible (D.22 enmienda la 225: antes
// se ocultaba si la fila de chips ya ofrecía «Quitar todos»; el nombre y el destino coinciden, WCAG 3.2.4).
// Los filtros ya acotados (`scopeEmptyResultsFilters`) solo deciden el tipo.
import type { ReactElement } from 'react';

import { StateIllustration } from '@/components/state-illustration';
import type { EmptyResultsKind } from '@/lib/empty-results';
import { buildClearFiltersHref, buildCurrentHref, buildFirstPageHref } from '@/lib/search-href';
import type { ClearKeepKey, RawSearchParams } from '@/lib/search-href';

export interface EmptyResultsProps {
  readonly kind: EmptyResultsKind;
  readonly params: RawSearchParams;
  readonly keepOnClear: readonly ClearKeepKey[];
  // Paso 3.2 (decisión 246, enmienda la 225): municipio de una zona CUBIERTA cuyo filtrado no deja
  // nada. Solo lo usa el tipo `filtered`: el detalle nombra el municipio y atribuye el vacío a los
  // filtros. Sigue siendo el mismo párrafo: ni rol vivo (160) ni segunda acción (225).
  readonly coveredZone?: string | null;
}

const FILTERED_DETAIL = 'Prueba a quitar algún filtro: están arriba y basta con pulsar uno.';

function Panel({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action: { readonly href: string; readonly label: string };
}): ReactElement {
  return (
    <div className="empty-results">
      <StateIllustration kind="empty" />
      <p className="empty-results__title">{title}</p>
      <p className="empty-results__detail">{detail}</p>
      <p className="empty-results__action">
        <a className="state-action" href={action.href}>
          {action.label}
        </a>
      </p>
    </div>
  );
}

export function EmptyResults({ kind, params, keepOnClear, coveredZone = null }: EmptyResultsProps): ReactElement {
  if (kind === 'unfiltered') {
    return (
      <Panel
        title="Aún no tenemos viviendas que enseñarte."
        detail="Estamos incorporando los anuncios de los portales. Vuelve a mirar dentro de un rato."
        action={{ href: buildCurrentHref(params), label: 'Comprobar de nuevo' }}
      />
    );
  }
  if (kind === 'past-last-page') {
    return (
      <Panel
        title="Esta página ya no tiene viviendas."
        detail="Tu búsqueda termina antes de esta página."
        action={{ href: buildFirstPageHref(params), label: 'Ir a la primera página' }}
      />
    );
  }
  // WCAG 3.2.4: dos enlaces con el mismo nombre deben llevar al mismo sitio. El de la fila de chips
  // quita también el polígono; si este lo conserva, se llama distinto.
  const clearName = keepOnClear.length > 0 ? 'Quitar los demás filtros' : 'Quitar todos los filtros';
  return (
    <Panel
      title="Ninguna vivienda coincide con tu búsqueda."
      detail={
        coveredZone === null
          ? FILTERED_DETAIL
          : `Los anuncios de ${coveredZone} están al día, así que son los filtros los que dejan la lista vacía. Prueba a quitar alguno: están arriba.`
      }
      action={{ href: buildClearFiltersHref(params, { keep: keepOnClear }), label: clearName }}
    />
  );
}

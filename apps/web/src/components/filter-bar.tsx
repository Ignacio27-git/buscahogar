// D.6a (decisión 151) — barra de filtros de la home: un formulario GET con los
// mismos campos que el panel de `?q=`, prefijados con lo que llegó en la URL.
// Server Component puro, sin `'use client'`: filtra sin JavaScript. Los `name`
// SON los search params; el envío, canonicalizado (`canonicalizeFormSubmission`,
// por la marca `form=criteria`), equivale a escribir la URL a mano.
//
// Nunca envía `page`: con otros filtros la página N pierde su sentido. La vista y
// la zona viajan en campos ocultos para no perderse al aplicar filtros.
//
// D.6b (decisión 153) — la barra va dentro de un `<details>` nativo: una bandeja
// cerrada por defecto en móvil que funciona sin JavaScript y con teclado. Desde
// 64rem el CSS la deja siempre desplegada. Sigue siendo un Server Component.
import type { ReactElement } from 'react';

import type { NlParamKey } from '@buscahogar/core';

import { CriteriaFields } from '@/components/criteria-fields';
import { CRITERIA_FORM_MARKER, pickFilterBarContext } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';

const FIELD_KEYS: readonly NlParamKey[] = [
  'operation',
  'propertyType',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'minBathrooms',
];

export interface FilterBarProps {
  readonly params: RawSearchParams;
  // Claves que el esquema rechazó (rama de parámetros inválidos): sus campos
  // visibles se prefijan con lo recibido para poder corregirlos, pero no se
  // reenvían como ocultos.
  readonly rejectedKeys?: ReadonlySet<string> | undefined;
  // D.15 (F4, decisión 196): id de la alerta que explica los rechazos. Con él, los campos
  // rechazados se declaran `aria-invalid` y se describen con esa alerta.
  readonly alertId?: string | undefined;
  // Filtros aplicados, los mismos que los chips (`countAppliedFilters`). `undefined`
  // o 0: el resumen dice solo «Filtros», sin número.
  readonly activeCount?: number | undefined;
  // Bandeja abierta de inicio: la rama de parámetros inválidos, para que se
  // vean los campos que la alerta nombra.
  readonly open?: boolean | undefined;
  // D.22 (decisión 268, HH-3): en la portada la bandeja queda plegada a TODOS los anchos (el CSS no la
  // fuerza abierta desde 64rem). Solo cambia la clase del <details>: el formulario, los nombres, los
  // campos ocultos y el envío son los de siempre.
  readonly disclosure?: boolean | undefined;
}

export function FilterBar({ params, rejectedKeys, alertId, activeCount, open, disclosure }: FilterBarProps): ReactElement {
  // El valor crudo que escribió el usuario, no el normalizado. Un valor repetido
  // (array) no prefija nada.
  const values: Partial<Record<NlParamKey, string>> = {};
  for (const key of FIELD_KEYS) {
    const value = params[key];
    if (typeof value === 'string') {
      values[key] = value;
    }
  }

  return (
    <details className={disclosure === true ? 'filter-tray filter-tray--disclosure' : 'filter-tray'} open={open === true}>
      <summary>
        Filtros
        {activeCount !== undefined && activeCount > 0 ? (
          <>
            {/* El espacio mantiene el nombre accesible legible: «Filtros 3 activos». */}{' '}
            <span className="filter-tray__count tabular-nums">
              {activeCount}
              <span className="sr-only">{activeCount === 1 ? ' activo' : ' activos'}</span>
            </span>
          </>
        ) : null}
      </summary>
      <form method="get" action="/" aria-label="Filtros de búsqueda" className="filter-bar">
        <input type="hidden" name="form" value={CRITERIA_FORM_MARKER} />
        {pickFilterBarContext(params, rejectedKeys).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <CriteriaFields
          values={values}
          idPrefix="filter"
          invalid={rejectedKeys !== undefined && alertId !== undefined ? { keys: rejectedKeys, errorId: alertId } : undefined}
        />
        <button type="submit" className="filter-bar__submit">
          Aplicar filtros
        </button>
      </form>
    </details>
  );
}

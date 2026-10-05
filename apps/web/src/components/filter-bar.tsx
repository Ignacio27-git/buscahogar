// D.6a (decisión 151) — barra de filtros de la home: un formulario GET con los
// mismos campos que el panel de `?q=`, prefijados con lo que llegó en la URL.
// Server Component puro, sin `'use client'`: filtra sin JavaScript. Los `name`
// SON los search params; el envío, canonicalizado (`canonicalizeFormSubmission`,
// por la marca `form=criteria`), equivale a escribir la URL a mano.
//
// Nunca envía `page`: con otros filtros la página N pierde su sentido. La vista y
// la zona viajan en campos ocultos para no perderse al aplicar filtros.
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
  'sort',
  'dir',
];

export interface FilterBarProps {
  readonly params: RawSearchParams;
  // Claves que el esquema rechazó (rama de parámetros inválidos): sus campos
  // visibles se prefijan con lo recibido para poder corregirlos, pero no se
  // reenvían como ocultos.
  readonly rejectedKeys?: ReadonlySet<string> | undefined;
}

export function FilterBar({ params, rejectedKeys }: FilterBarProps): ReactElement {
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
    <form method="get" action="/" aria-label="Filtros de búsqueda" className="filter-bar">
      <input type="hidden" name="form" value={CRITERIA_FORM_MARKER} />
      {pickFilterBarContext(params, rejectedKeys).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <CriteriaFields values={values} idPrefix="filter" />
      <button type="submit">Aplicar filtros</button>
    </form>
  );
}

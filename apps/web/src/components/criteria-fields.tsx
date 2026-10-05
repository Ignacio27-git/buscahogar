// D.6a (impeccable extract, segundo uso) — los diez campos de criterio que
// comparten el panel de confirmación de `?q=` (`CriteriaForm`) y la barra de
// filtros (`FilterBar`). Server Component puro, sin `'use client'`. El marcado es
// idéntico en ambos salvo el prefijo de los ids (y el `for` de cada etiqueta):
// los `name` SON los search params, así que el envío es ya la URL de búsqueda.
import type { ReactElement } from 'react';

import { OPERATION_TYPES, PROPERTY_TYPES } from '@buscahogar/core';
import type { NlParamKey } from '@buscahogar/core';

import { DIR_LABELS, FIELD_LABELS, OPERATION_LABELS, PROPERTY_TYPE_LABELS, SORT_LABELS } from '@/lib/search-labels';

interface SelectFieldProps {
  readonly field: NlParamKey;
  readonly idPrefix: string;
  readonly value: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

function SelectField({ field, idPrefix, value, options }: SelectFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <select id={`${idPrefix}-${field}`} name={field} defaultValue={value ?? ''}>
        <option value="">Cualquiera</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}

interface NumberFieldProps {
  readonly field: NlParamKey;
  readonly idPrefix: string;
  readonly value: string | undefined;
  readonly step: string;
}

function NumberField({ field, idPrefix, value, step }: NumberFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <input id={`${idPrefix}-${field}`} type="number" name={field} defaultValue={value ?? ''} min="0" step={step} />
    </p>
  );
}

export interface CriteriaFieldsProps {
  // Valores prefijados (importes en euros).
  readonly values: Readonly<Partial<Record<NlParamKey, string>>>;
  // Prefijo de los ids: `criteria` en el panel de `?q=`, `filter` en la barra.
  readonly idPrefix: string;
}

export function CriteriaFields({ values, idPrefix }: CriteriaFieldsProps): ReactElement {
  return (
    <>
      <SelectField
        field="operation"
        idPrefix={idPrefix}
        value={values.operation}
        options={OPERATION_TYPES.map((value) => ({ value, label: OPERATION_LABELS[value] }))}
      />
      <SelectField
        field="propertyType"
        idPrefix={idPrefix}
        value={values.propertyType}
        options={PROPERTY_TYPES.map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }))}
      />
      <fieldset>
        <legend>Precio (€)</legend>
        <NumberField field="minPrice" idPrefix={idPrefix} value={values.minPrice} step="0.01" />
        <NumberField field="maxPrice" idPrefix={idPrefix} value={values.maxPrice} step="0.01" />
      </fieldset>
      <fieldset>
        <legend>Superficie (m²)</legend>
        <NumberField field="minSurface" idPrefix={idPrefix} value={values.minSurface} step="any" />
        <NumberField field="maxSurface" idPrefix={idPrefix} value={values.maxSurface} step="any" />
      </fieldset>
      <NumberField field="minRooms" idPrefix={idPrefix} value={values.minRooms} step="1" />
      <NumberField field="minBathrooms" idPrefix={idPrefix} value={values.minBathrooms} step="1" />
      <SelectField
        field="sort"
        idPrefix={idPrefix}
        value={values.sort}
        options={(['price', 'surface', 'updated'] as const).map((value) => ({ value, label: SORT_LABELS[value] }))}
      />
      <SelectField
        field="dir"
        idPrefix={idPrefix}
        value={values.dir}
        options={(['asc', 'desc'] as const).map((value) => ({ value, label: DIR_LABELS[value] }))}
      />
    </>
  );
}

// ROADMAP 3.1 (decisión 123) — panel de confirmación de `?q=`: la
// interpretación como un formulario GET editable. Server Component puro, sin
// `'use client'`. Los `name` de los campos SON los search params (así que el
// envío es ya la URL de la búsqueda normal), más el campo oculto
// `form=criteria` que la página usa para quitar los campos en blanco antes de
// validar (`canonicalizeFormSubmission`).
import type { ReactElement } from 'react';

import { OPERATION_TYPES, PROPERTY_TYPES } from '@buscahogar/core';
import type { NlConflict, NlParamKey } from '@buscahogar/core';
import type { ZoneSuggestion } from '@buscahogar/db';

import { CRITERIA_FORM_MARKER } from '@/lib/search-href';
import {
  DIR_LABELS,
  FIELD_LABELS,
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
  SORT_LABELS,
} from '@/lib/search-labels';

export interface CriteriaFormProps {
  // Valores interpretados (importes en euros), prefijados en los campos.
  readonly values: Readonly<Partial<Record<NlParamKey, string>>>;
  // Municipios entre los que elegir; vacío si el texto no nombró lugar o no
  // coincidió ninguno.
  readonly zoneChoices: readonly ZoneSuggestion[];
  // Código INE marcado, o null (opción «Sin zona»).
  readonly selectedZone: string | null;
  readonly unrecognised: readonly string[];
  readonly conflicts: readonly NlConflict[];
  // Rechazos nombrados del esquema; vacío si la interpretación es válida.
  readonly issues: readonly string[];
}

interface SelectFieldProps {
  readonly field: NlParamKey;
  readonly value: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

function SelectField({ field, value, options }: SelectFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`criteria-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <select id={`criteria-${field}`} name={field} defaultValue={value ?? ''}>
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
  readonly value: string | undefined;
  readonly step: string;
}

function NumberField({ field, value, step }: NumberFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`criteria-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <input id={`criteria-${field}`} type="number" name={field} defaultValue={value ?? ''} min="0" step={step} />
    </p>
  );
}

export function CriteriaForm(props: CriteriaFormProps): ReactElement {
  const { values, zoneChoices, selectedZone, unrecognised, conflicts, issues } = props;
  return (
    <section aria-label="Interpretación de tu búsqueda">
      <h2>Esto es lo que he entendido</h2>
      <p>Revísalo y corrígelo si hace falta; la búsqueda no se ejecuta hasta que pulses «Buscar».</p>
      {issues.length > 0 ? <p role="alert">No se pudo interpretar la búsqueda: {issues.join('; ')}</p> : null}
      {unrecognised.length > 0 ? (
        <div>
          <p>No he entendido:</p>
          <ul>
            {unrecognised.map((fragment) => (
              <li key={fragment}>{fragment}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {conflicts.length > 0 ? (
        <div>
          <p>Indicaciones contradictorias (no he elegido ninguna):</p>
          <ul>
            {conflicts.map((conflict) => (
              <li key={conflict.field}>
                {FIELD_LABELS[conflict.field]}: {conflict.fragments.map((fragment) => fragment.text).join(' / ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form method="get" action="/">
        <input type="hidden" name="form" value={CRITERIA_FORM_MARKER} />
        <SelectField
          field="operation"
          value={values.operation}
          options={OPERATION_TYPES.map((value) => ({ value, label: OPERATION_LABELS[value] }))}
        />
        <SelectField
          field="propertyType"
          value={values.propertyType}
          options={PROPERTY_TYPES.map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }))}
        />
        <fieldset>
          <legend>Precio (€)</legend>
          <NumberField field="minPrice" value={values.minPrice} step="0.01" />
          <NumberField field="maxPrice" value={values.maxPrice} step="0.01" />
        </fieldset>
        <fieldset>
          <legend>Superficie (m²)</legend>
          <NumberField field="minSurface" value={values.minSurface} step="any" />
          <NumberField field="maxSurface" value={values.maxSurface} step="any" />
        </fieldset>
        <NumberField field="minRooms" value={values.minRooms} step="1" />
        <NumberField field="minBathrooms" value={values.minBathrooms} step="1" />
        <SelectField
          field="sort"
          value={values.sort}
          options={(['price', 'surface', 'updated'] as const).map((value) => ({ value, label: SORT_LABELS[value] }))}
        />
        <SelectField
          field="dir"
          value={values.dir}
          options={(['asc', 'desc'] as const).map((value) => ({ value, label: DIR_LABELS[value] }))}
        />
        <fieldset>
          <legend>Zona</legend>
          <p>
            <input id="criteria-zone-none" type="radio" name="zone" value="" defaultChecked={selectedZone === null} />{' '}
            <label htmlFor="criteria-zone-none">Sin zona</label>
          </p>
          {zoneChoices.map((choice) => (
            <p key={choice.ineCode}>
              <input
                id={`criteria-zone-${choice.ineCode}`}
                type="radio"
                name="zone"
                value={choice.ineCode}
                defaultChecked={selectedZone === choice.ineCode}
              />{' '}
              <label htmlFor={`criteria-zone-${choice.ineCode}`}>
                {choice.municipality} ({choice.province}){!choice.sweepable ? ' — sin cobertura disponible' : ''}
              </label>
            </p>
          ))}
        </fieldset>
        <button type="submit">Buscar</button>
      </form>
    </section>
  );
}

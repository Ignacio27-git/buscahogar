// D.6a (impeccable extract, segundo uso) — los diez campos de criterio que
// comparten el panel de confirmación de `?q=` (`CriteriaForm`) y la barra de
// filtros (`FilterBar`). Server Component puro, sin `'use client'`. El marcado es
// idéntico en ambos salvo el prefijo de los ids (y el `for` de cada etiqueta):
// los `name` SON los search params, así que el envío es ya la URL de búsqueda.
import type { ReactElement, ReactNode } from 'react';

import { OPERATION_TYPES, PROPERTY_TYPES } from '@buscahogar/core';
import type { NlParamKey } from '@buscahogar/core';

import { FIELD_LABELS, OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/search-labels';
import { SORT_PRESETS, sortPresetFor } from '@/lib/sort-presets';

// D.15 (F4, decisión 196) — campos que el esquema rechazó y la alerta que lo explica. Un campo
// rechazado se declara `aria-invalid` y se describe con esa alerta (una sola fuente del texto).
export interface InvalidFields {
  readonly keys: ReadonlySet<string>;
  readonly errorId: string;
}

function invalidProps(
  field: NlParamKey,
  invalid: InvalidFields | undefined
): { readonly 'aria-invalid'?: true; readonly 'aria-describedby'?: string } {
  return invalid?.keys.has(field) === true
    ? { 'aria-invalid': true, 'aria-describedby': invalid.errorId }
    : {};
}

// D.15 (decisión 204) — `type="number"` descarta en silencio las letras que se teclean y nada se
// lo decía a un lector de pantalla. Una sola pista visible por formulario (no seis repetidas), con
// id derivado del prefijo y referenciada por `aria-describedby` desde los seis campos numéricos.
const NUMERIC_HINT = 'Precio, superficie, habitaciones y baños: solo cifras.';

function numericHintId(idPrefix: string): string {
  return `${idPrefix}-numeric-hint`;
}

function NumericHint({ idPrefix }: { readonly idPrefix: string }): ReactElement {
  return (
    <p id={numericHintId(idPrefix)} className="field-hint">
      {NUMERIC_HINT}
    </p>
  );
}

// Pista primero y alerta después, el mismo orden que el campo de texto libre (`search-text-help`
// y su alerta): una sola convención en la app.
function numberDescribedBy(idPrefix: string, field: NlParamKey, invalid: InvalidFields | undefined): string {
  const hintId = numericHintId(idPrefix);
  return invalid?.keys.has(field) === true ? `${hintId} ${invalid.errorId}` : hintId;
}

interface SelectFieldProps {
  readonly field: NlParamKey;
  readonly idPrefix: string;
  readonly value: string | undefined;
  readonly invalid?: InvalidFields | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

function SelectField({ field, idPrefix, value, options, invalid }: SelectFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <select id={`${idPrefix}-${field}`} name={field} defaultValue={value ?? ''} {...invalidProps(field, invalid)}>
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
  readonly invalid?: InvalidFields | undefined;
}

function NumberField({ field, idPrefix, value, step, invalid }: NumberFieldProps): ReactElement {
  return (
    <p>
      <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>{' '}
      <input
        id={`${idPrefix}-${field}`}
        type="number"
        name={field}
        defaultValue={value ?? ''}
        min="0"
        step={step}
        {...invalidProps(field, invalid)}
        aria-describedby={numberDescribedBy(idPrefix, field, invalid)}
      />
    </p>
  );
}

// D.18 (decisión 227) — el orden del panel de `?q=`: los mismos cinco rótulos que los enlaces de la
// lista, como radios `name="order"` (valor = id del preset). `canonicalizeFormSubmission` los
// convierte en sort/dir. Marca el preset de los valores interpretados; sin preset (o sin orden
// interpretado) queda marcado el predefinido, que es el que aplicaría la búsqueda.
function OrderFieldset({
  values,
  idPrefix,
  invalid,
}: {
  readonly values: Readonly<Partial<Record<NlParamKey, string>>>;
  readonly idPrefix: string;
  readonly invalid: InvalidFields | undefined;
}): ReactElement {
  const checked = sortPresetFor(values.sort, values.dir)?.id ?? SORT_PRESETS[0]?.id;
  const describedBy =
    invalid !== undefined && (invalid.keys.has('sort') || invalid.keys.has('dir')) ? invalid.errorId : undefined;
  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="sr-only">Orden de los resultados</legend>
      {SORT_PRESETS.map((preset) => (
        <p key={preset.id}>
          <input
            type="radio"
            id={`${idPrefix}-order-${preset.id}`}
            name="order"
            value={preset.id}
            defaultChecked={preset.id === checked}
          />{' '}
          <label htmlFor={`${idPrefix}-order-${preset.id}`}>{preset.label}</label>
        </p>
      ))}
    </fieldset>
  );
}

export interface CriteriaFieldsProps {
  // Valores prefijados (importes en euros).
  readonly values: Readonly<Partial<Record<NlParamKey, string>>>;
  // Prefijo de los ids: `criteria` en el panel de `?q=`, `filter` en la barra.
  readonly idPrefix: string;
  // D.7 (decisión 161) — agrupación opcional en bloques con título de pregunta, usada
  // solo por el panel de `?q=`. Ausente, el marcado es el de siempre (la barra de
  // filtros y su prueba de identidad no cambian). `zone` es la ranura de la zona,
  // que solo el panel conoce.
  readonly grouped?: { readonly zone: ReactElement };
  // D.15 (F4): campos rechazados por el esquema; ausente, ningún campo se declara inválido.
  readonly invalid?: InvalidFields | undefined;
}

function Group({ title, secondary, children }: { readonly title: string; readonly secondary?: boolean; readonly children: ReactNode }): ReactElement {
  return (
    <div className={secondary === true ? 'criteria-group criteria-group--secondary' : 'criteria-group'}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function CriteriaFields({ values, idPrefix, grouped, invalid }: CriteriaFieldsProps): ReactElement {
  if (grouped !== undefined) {
    return (
      <>
        <Group title="¿Qué buscas?">
          <SelectField
            field="operation"
            idPrefix={idPrefix} invalid={invalid}
            value={values.operation}
            options={OPERATION_TYPES.map((value) => ({ value, label: OPERATION_LABELS[value] }))}
          />
          <SelectField
            field="propertyType"
            idPrefix={idPrefix} invalid={invalid}
            value={values.propertyType}
            options={PROPERTY_TYPES.map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }))}
          />
        </Group>
        <Group title="¿Cuánto quieres pagar?">
          <NumericHint idPrefix={idPrefix} />
          <fieldset>
            <legend>Precio (€)</legend>
            <NumberField field="minPrice" idPrefix={idPrefix} invalid={invalid} value={values.minPrice} step="0.01" />
            <NumberField field="maxPrice" idPrefix={idPrefix} invalid={invalid} value={values.maxPrice} step="0.01" />
          </fieldset>
        </Group>
        <Group title="¿De qué tamaño?">
          <fieldset>
            <legend>Superficie (m²)</legend>
            <NumberField field="minSurface" idPrefix={idPrefix} invalid={invalid} value={values.minSurface} step="any" />
            <NumberField field="maxSurface" idPrefix={idPrefix} invalid={invalid} value={values.maxSurface} step="any" />
          </fieldset>
          <NumberField field="minRooms" idPrefix={idPrefix} invalid={invalid} value={values.minRooms} step="1" />
          <NumberField field="minBathrooms" idPrefix={idPrefix} invalid={invalid} value={values.minBathrooms} step="1" />
        </Group>
        <Group title="¿Dónde?">{grouped.zone}</Group>
        <Group title="Orden de los resultados" secondary>
          <OrderFieldset values={values} idPrefix={idPrefix} invalid={invalid} />
        </Group>
      </>
    );
  }
  return (
    <>
      <SelectField
        field="operation"
        idPrefix={idPrefix} invalid={invalid}
        value={values.operation}
        options={OPERATION_TYPES.map((value) => ({ value, label: OPERATION_LABELS[value] }))}
      />
      <SelectField
        field="propertyType"
        idPrefix={idPrefix} invalid={invalid}
        value={values.propertyType}
        options={PROPERTY_TYPES.map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }))}
      />
      <fieldset>
        <legend>Precio (€)</legend>
        <NumberField field="minPrice" idPrefix={idPrefix} invalid={invalid} value={values.minPrice} step="0.01" />
        <NumberField field="maxPrice" idPrefix={idPrefix} invalid={invalid} value={values.maxPrice} step="0.01" />
      </fieldset>
      <fieldset>
        <legend>Superficie (m²)</legend>
        <NumberField field="minSurface" idPrefix={idPrefix} invalid={invalid} value={values.minSurface} step="any" />
        <NumberField field="maxSurface" idPrefix={idPrefix} invalid={invalid} value={values.maxSurface} step="any" />
      </fieldset>
      <NumberField field="minRooms" idPrefix={idPrefix} invalid={invalid} value={values.minRooms} step="1" />
      <NumberField field="minBathrooms" idPrefix={idPrefix} invalid={invalid} value={values.minBathrooms} step="1" />
      {/* D.17 (B2): la pista queda pegada a los campos numéricos, no suelta encima de toda la barra. */}
      <NumericHint idPrefix={idPrefix} />
    </>
  );
}

// ROADMAP 3.1 (decisión 123) — panel de confirmación de `?q=`: la
// interpretación como un formulario GET editable. Server Component puro, sin
// `'use client'`. Los `name` de los campos SON los search params (así que el
// envío es ya la URL de la búsqueda normal), más el campo oculto
// `form=criteria` que la página usa para quitar los campos en blanco antes de
// validar (`canonicalizeFormSubmission`). Los campos de criterio los comparte con
// la barra de filtros vía `CriteriaFields`.
import type { ReactElement } from 'react';

import type { NlConflict, NlParamKey } from '@buscahogar/core';
import type { ZoneSuggestion } from '@buscahogar/db';

import { CriteriaFields } from '@/components/criteria-fields';
import { CRITERIA_FORM_MARKER } from '@/lib/search-href';
import { FIELD_LABELS } from '@/lib/search-labels';

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
        <CriteriaFields values={values} idPrefix="criteria" />
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

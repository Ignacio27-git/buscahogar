// ROADMAP 3.1 (decisión 123) — panel de confirmación de `?q=`: la
// interpretación como un formulario GET editable. Server Component puro, sin
// `'use client'`. Los `name` de los campos SON los search params (así que el
// envío es ya la URL de la búsqueda normal), más el campo oculto
// `form=criteria` que la página usa para quitar los campos en blanco antes de
// validar (`canonicalizeFormSubmission`). Los campos de criterio los comparte con
// la barra de filtros vía `CriteriaFields`.
//
// D.7 (decisiones 159-162): el panel es una revisión, no un volcado. Un único
// estado (`role="status"`), la alerta solo para el rechazo del esquema, un bloque
// con lo que no se entendió, un resumen de solo lectura, los campos agrupados por
// pregunta y la zona según su estado. Todo se deriva de lo que recibe.
import type { ReactElement } from 'react';

import type { NlConflict, NlParamKey, PropertySearchCriteria } from '@buscahogar/core';
import type { ZoneSuggestion } from '@buscahogar/db';

import { AppliedFiltersSummary } from '@/components/applied-filters';
import { CriteriaFields } from '@/components/criteria-fields';
import { CRITERIA_FORM_MARKER } from '@/lib/search-href';
import { FIELD_LABELS, describeInterpretationStatus } from '@/lib/search-labels';

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
  // Criterio validado, o null si el esquema lo rechazó (no hay resumen).
  readonly criteria: PropertySearchCriteria | null;
  // Lugar tal como lo escribió la persona, o null si no nombró ninguno.
  readonly placeText: string | null;
}

const NO_ZONE_LABEL = 'Sin zona (cualquier municipio)';

// Estados de la zona (decisión 162), derivados de lo que recibe el panel:
// `exact` = una coincidencia exacta preseleccionada; `choose` = hay candidatos y
// ninguno está marcado (varios, o uno solo por prefijo); `notFound` = se escribió
// un lugar y no hay candidatos; `noPlace` = no se escribió ningún lugar.
type ZoneState = 'noPlace' | 'notFound' | 'exact' | 'choose';

function zoneStateOf(
  placeText: string | null,
  zoneChoices: readonly ZoneSuggestion[],
  selectedZone: string | null
): ZoneState {
  if (selectedZone !== null) return 'exact';
  if (zoneChoices.length > 0) return 'choose';
  return placeText === null ? 'noPlace' : 'notFound';
}

interface ZoneFieldProps {
  readonly state: ZoneState;
  readonly placeText: string | null;
  readonly zoneChoices: readonly ZoneSuggestion[];
  readonly selectedZone: string | null;
}

function zoneNote({ state, placeText, zoneChoices, selectedZone }: ZoneFieldProps): string {
  const selected = zoneChoices.find((choice) => choice.ineCode === selectedZone);
  if (state === 'exact') {
    return `${selected?.municipality ?? 'Ese municipio'} es el único municipio que se llama así, por eso está marcado. Si no es el que buscas, elige «Sin zona».`;
  }
  if (state === 'choose') {
    return zoneChoices.length === 1
      ? 'Ningún municipio se llama exactamente así; este es el más parecido. Márcalo si es el que buscas; si no, se busca sin zona.'
      : 'Varios municipios encajan con lo que has escrito. Elige uno; si no, se busca sin zona.';
  }
  if (state === 'notFound') {
    return `No hay ningún municipio que se llame «${placeText ?? ''}». Revisa cómo está escrito o busca sin zona.`;
  }
  return 'Para buscar en un municipio, nómbralo en tu texto, por ejemplo «en Getafe».';
}

function ZoneField(props: ZoneFieldProps): ReactElement {
  const { state, placeText, zoneChoices, selectedZone } = props;
  return (
    <fieldset className="zone-field">
      <legend>{state === 'choose' ? `Elige la zona para «${placeText ?? ''}»` : 'Zona'}</legend>
      <p className="zone-field__note">{zoneNote(props)}</p>
      <div className="zone-field__choices">
        <p>
          <input id="criteria-zone-none" type="radio" name="zone" value="" defaultChecked={selectedZone === null} />{' '}
          <label htmlFor="criteria-zone-none">{NO_ZONE_LABEL}</label>
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
      </div>
    </fieldset>
  );
}

export function CriteriaForm(props: CriteriaFormProps): ReactElement {
  const { values, zoneChoices, selectedZone, unrecognised, conflicts, issues, criteria, placeText } = props;
  const zoneState = zoneStateOf(placeText, zoneChoices, selectedZone);
  const zonePending = zoneState === 'choose';
  // Una zona exacta cuenta como reconocida aunque no haya ningún otro criterio.
  const hasRecognised = Object.keys(values).length > 0 || selectedZone !== null;
  const zoneName = zoneChoices.find((choice) => choice.ineCode === selectedZone)?.municipality ?? null;

  return (
    <section aria-labelledby="nl-review-heading" className="nl-review">
      <h2 id="nl-review-heading">Revisa los filtros</h2>
      <p role="status" className="nl-review__status">
        {describeInterpretationStatus({
          hasRecognised,
          unrecognised: unrecognised.length,
          conflicts: conflicts.length,
          zonePending,
        })}
      </p>
      {issues.length > 0 ? (
        <p role="alert" className="nl-review__alert">
          <span className="nl-review__lead">Algún filtro no es válido; corrígelo abajo antes de buscar.</span> Detalle:{' '}
          {issues.join('; ')}
        </p>
      ) : null}
      {!hasRecognised && !zonePending ? (
        <p className="nl-review__empty">
          Prueba a nombrar el tipo de vivienda, la operación, el precio o el municipio, como en el ejemplo, o elige los
          filtros a mano.
        </p>
      ) : null}
      {unrecognised.length > 0 || conflicts.length > 0 ? (
        <div className="nl-issues">
          {unrecognised.length > 0 ? (
            <div>
              <h3>Partes sin reconocer</h3>
              <p>No se han tenido en cuenta en los filtros.</p>
              <ul>
                {unrecognised.map((fragment) => (
                  <li key={fragment}>{fragment}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {conflicts.length > 0 ? (
            <div>
              <h3>Indicaciones contradictorias</h3>
              <p>No se ha aplicado ninguna: elige el valor en su campo.</p>
              <ul>
                {conflicts.map((conflict) => (
                  <li key={conflict.field}>
                    {FIELD_LABELS[conflict.field]}: {conflict.fragments.map((fragment) => fragment.text).join(' / ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {criteria !== null ? <AppliedFiltersSummary criteria={criteria} zoneName={zoneName} /> : null}
      <p className="nl-review__hint">La búsqueda no empieza hasta que pulses «Buscar».</p>
      <form method="get" action="/" className="criteria-form">
        <input type="hidden" name="form" value={CRITERIA_FORM_MARKER} />
        <CriteriaFields
          values={values}
          idPrefix="criteria"
          grouped={{
            zone: <ZoneField state={zoneState} placeText={placeText} zoneChoices={zoneChoices} selectedZone={selectedZone} />,
          }}
        />
        <button type="submit" className="criteria-form__submit">
          Buscar
        </button>
      </form>
    </section>
  );
}

// Sonda de `adIds` de Idealista (ROADMAP 2.5, S3; decisión 105, U2/U3) —
// interpretación PURA de las respuestas y construcción de la meta de la fixture.
// Sin red, sin disco.
//
// La meta es la EVIDENCIA que una persona revisa antes de cambiar el literal
// `DELISTED_OMISSION_CONFIRMED` (src/sources/idealista/presence-evidence.ts):
// solo `delistedIdBehaviour === 'omitted'` lo autoriza, y un test ata la
// constante a la fixture más reciente.
//
// La interpretación de una respuesta usa `readReturnedIds` (la misma que el
// clasificador de producción): la sonda y producción leen una respuesta igual.
import { readReturnedIds } from '../../src/sources/idealista/presence-classify.js';

// Resultado de UNA petición de búsqueda de la sonda, ya reducido a lo que
// importa. `failed` = estado HTTP de error, error de red o cuerpo no JSON;
// `skipped` = la sonda se detuvo antes de enviarla.
export type ProbeSearchOutcome =
  | { readonly kind: 'ok'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'failed'; readonly status: number | null }
  | { readonly kind: 'skipped' };

export type DelistedIdBehaviour = 'omitted' | 'error' | 'other';

function returnedIds(outcome: ProbeSearchOutcome): ReadonlySet<string> | null {
  return outcome.kind === 'ok' ? readReturnedIds(outcome.body) : null;
}

function onlyLive(ids: ReadonlySet<string> | null, liveId: string): boolean {
  return ids !== null && ids.size === 1 && ids.has(liveId);
}

export interface DelistedIdEvidenceInput {
  // Respuesta al id vivo SOLO (paso 1).
  readonly liveAlone: ProbeSearchOutcome;
  // Respuesta al id vivo + el dado de baja juntos (paso 2).
  readonly liveAndDelisted: ProbeSearchOutcome;
  readonly liveId: string;
  readonly delistedId: string;
}

// - 'error': la petición combinada falló (HTTP de error, red, cuerpo no JSON).
// - 'omitted': `adIds` se respeta para el id vivo solo (vuelve ÉL y nada más) y,
//   junto al dado de baja, vuelve SOLO el vivo: el dado de baja se omite, sin
//   ids ajenos, en una respuesta fiable de una página.
// - 'other': cualquier otra cosa (el dado de baja aparece, la lista de dos ids no
//   se respetó, hay ids ajenos, envelope inválido, paso omitido…): NO es
//   evidencia de omisión y el literal debe seguir en false.
export function classifyDelistedIdBehaviour(input: DelistedIdEvidenceInput): DelistedIdBehaviour {
  if (input.liveAndDelisted.kind === 'failed') {
    return 'error';
  }
  const combined = returnedIds(input.liveAndDelisted);
  const aloneHonoured = onlyLive(returnedIds(input.liveAlone), input.liveId);
  const delistedOmitted = onlyLive(combined, input.liveId);
  return aloneHonoured && delistedOmitted ? 'omitted' : 'other';
}

// Paso 3: el id vivo bajo OTRO filtro. Si vuelve, `propertyType` NO restringe a
// `adIds` (false); si una respuesta fiable no lo trae, sí restringe (true).
export function classifyPropertyTypeConstraint(outcome: ProbeSearchOutcome, liveId: string): boolean | 'unknown' {
  const ids = returnedIds(outcome);
  if (ids === null) {
    return 'unknown';
  }
  return !ids.has(liveId);
}

export interface ProbeOutcomeSummary {
  readonly outcome: ProbeSearchOutcome['kind'];
  readonly httpStatus: number | null;
  // Ids devueltos (respuesta fiable) o null si no hay respuesta interpretable.
  readonly returnedIds: readonly string[] | null;
}

// Resumen sin volcar el cuerpo: lo que va a la meta de la fixture.
export function describeProbeOutcome(outcome: ProbeSearchOutcome): ProbeOutcomeSummary {
  const ids = returnedIds(outcome);
  return {
    outcome: outcome.kind,
    httpStatus: outcome.kind === 'skipped' ? null : outcome.status,
    returnedIds: ids === null ? null : [...ids],
  };
}

export interface AdIdsProbeMetaInput {
  readonly timestamp: string;
  readonly counters: { readonly token: number; readonly search: number };
  readonly requests: readonly unknown[];
  readonly liveId: string;
  readonly delistedId: string;
  readonly outcomes: {
    readonly liveAlone: ProbeSearchOutcome;
    readonly liveAndDelisted: ProbeSearchOutcome;
    readonly liveOtherFilter: ProbeSearchOutcome;
  };
}

export interface AdIdsProbeMeta {
  readonly delistedIdBehaviour: DelistedIdBehaviour;
  readonly propertyTypeConstrainsAdIds: boolean | 'unknown';
  // La lista de dos ids separada por comas se respetó (el vivo volvió y no hubo
  // ids ajenos): la codificación "coma" funciona.
  readonly adIdsListEncoding: 'comma-separated';
  readonly adIdsListHonoured: boolean;
  readonly liveId: string;
  readonly delistedId: string;
  readonly responses: {
    readonly liveAlone: ProbeOutcomeSummary;
    readonly liveAndDelisted: ProbeOutcomeSummary;
    readonly liveOtherFilter: ProbeOutcomeSummary;
  };
  readonly requests: readonly unknown[];
  readonly counters: { readonly token: number; readonly search: number };
  readonly endpoint: string;
  readonly timestamp: string;
  readonly tokenQuotaImpact: 'unknown';
  readonly searchQuotaImpact: 'billable';
}

const SEARCH_ENDPOINT = 'https://api.idealista.com/3.5/es/search';

export function buildAdIdsProbeMeta(input: AdIdsProbeMetaInput): AdIdsProbeMeta {
  const { liveAlone, liveAndDelisted, liveOtherFilter } = input.outcomes;
  const combined = returnedIds(liveAndDelisted);
  return {
    delistedIdBehaviour: classifyDelistedIdBehaviour({
      liveAlone,
      liveAndDelisted,
      liveId: input.liveId,
      delistedId: input.delistedId,
    }),
    propertyTypeConstrainsAdIds: classifyPropertyTypeConstraint(liveOtherFilter, input.liveId),
    adIdsListEncoding: 'comma-separated',
    adIdsListHonoured:
      combined !== null &&
      combined.has(input.liveId) &&
      [...combined].every((id) => id === input.liveId || id === input.delistedId),
    liveId: input.liveId,
    delistedId: input.delistedId,
    responses: {
      liveAlone: describeProbeOutcome(liveAlone),
      liveAndDelisted: describeProbeOutcome(liveAndDelisted),
      liveOtherFilter: describeProbeOutcome(liveOtherFilter),
    },
    requests: input.requests,
    counters: input.counters,
    endpoint: SEARCH_ENDPOINT,
    timestamp: input.timestamp,
    tokenQuotaImpact: 'unknown',
    searchQuotaImpact: 'billable',
  };
}

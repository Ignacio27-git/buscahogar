// ROADMAP 3.1 (decisión 122) — resolución del lugar que el intérprete extrae de
// `?q=`. Puro: recibe las sugerencias que `suggestZones` ya consultó en la base
// de datos (nunca una fuente externa) y decide qué hacer con ellas.
//
// Regla de seguridad: SOLO una coincidencia exacta del nombre normalizado
// selecciona zona. Un prefijo es habitual entre municipios distintos
// ("madrid" también casa con "madridejos"), y elegir mal registraría un
// barrido de cobertura sobre la zona equivocada, que gasta cuota.
import { normalizeSearchName } from '@buscahogar/core';
import type { ZoneSuggestion } from '@buscahogar/db';

// Tope de sugerencias para resolver el lugar de `?q=`. `suggestZones` ordena
// por nombre normalizado ascendente, y un nombre siempre precede a sus
// extensiones ("madrid" < "madridejos"), de modo que la coincidencia exacta
// queda al principio de la lista y ningún tope razonable la oculta tras los
// prefijos. Se fija holgado (25, más que los 10 del autocompletado) porque el
// usuario elige entre ellas en un grupo de opciones, no en una lista corta.
export const PLACE_SUGGESTION_LIMIT = 25;

export type PlaceMatch =
  | { readonly kind: 'zone'; readonly zone: ZoneSuggestion }
  | { readonly kind: 'choose'; readonly zones: readonly ZoneSuggestion[] }
  | { readonly kind: 'unrecognised'; readonly text: string };

export function classifyPlaceMatches(placeText: string, suggestions: readonly ZoneSuggestion[]): PlaceMatch {
  if (suggestions.length === 0) {
    return { kind: 'unrecognised', text: placeText };
  }
  const wanted = normalizeSearchName(placeText);
  const exact = suggestions.filter((suggestion) => normalizeSearchName(suggestion.municipality) === wanted);
  const [only] = exact;
  if (exact.length === 1 && only !== undefined) {
    return { kind: 'zone', zone: only };
  }
  return { kind: 'choose', zones: suggestions };
}

// ROADMAP 3.1 (decisión 122) — resolución del lugar de `?q=` contra las
// sugerencias de zona. Solo se autoselecciona una coincidencia EXACTA del
// nombre normalizado; un prefijo nunca elige zona ("madrid" ⊂ "madridejos").
import { describe, expect, it } from 'vitest';

import type { ZoneSuggestion } from '@buscahogar/db';

import { PLACE_SUGGESTION_LIMIT, classifyPlaceMatches } from '../src/lib/place-match.js';

function zone(municipality: string, ineCode: string, province = 'Madrid'): ZoneSuggestion {
  return { ineCode, municipality, province, state: 'covered', sweepable: true };
}

describe('classifyPlaceMatches', () => {
  it('una única coincidencia exacta selecciona la zona', () => {
    const getafe = zone('Getafe', '28065');
    expect(classifyPlaceMatches('Getafe', [getafe])).toEqual({ kind: 'zone', zone: getafe });
  });

  it('la comparación ignora mayúsculas y acentos', () => {
    const alcala = zone('Alcalá de Henares', '28005');
    expect(classifyPlaceMatches('alcala de henares', [alcala])).toEqual({ kind: 'zone', zone: alcala });
  });

  it('un prefijo único NO se autoselecciona: se ofrece para elegir', () => {
    const madridejos = zone('Madridejos', '45093', 'Toledo');
    expect(classifyPlaceMatches('Madrid', [madridejos])).toEqual({ kind: 'choose', zones: [madridejos] });
  });

  it('la coincidencia exacta no queda oculta tras los prefijos ("madrid" frente a "madridejos")', () => {
    const madrid = zone('Madrid', '28079');
    const madridejos = zone('Madridejos', '45093', 'Toledo');
    // Con la exacta al final de la lista, y también al principio.
    expect(classifyPlaceMatches('madrid', [madridejos, madrid])).toEqual({ kind: 'zone', zone: madrid });
    expect(classifyPlaceMatches('madrid', [madrid, madridejos])).toEqual({ kind: 'zone', zone: madrid });
  });

  it('varios municipios con el mismo nombre exacto: se elige, no se autoselecciona', () => {
    const a = zone('Villanueva', '10001', 'Cáceres');
    const b = zone('Villanueva', '20002', 'Gipuzkoa');
    expect(classifyPlaceMatches('Villanueva', [a, b])).toEqual({ kind: 'choose', zones: [a, b] });
  });

  it('sin coincidencias, el lugar queda sin reconocer', () => {
    expect(classifyPlaceMatches('Atlantis', [])).toEqual({ kind: 'unrecognised', text: 'Atlantis' });
  });

  it('el tope de sugerencias es explícito y holgado frente al de autocompletado', () => {
    expect(PLACE_SUGGESTION_LIMIT).toBe(25);
  });
});

import { describe, expect, it } from 'vitest';

import { classify, isVetoed } from '../src/strategies/rule-based/classify.js';
import { ruleBasedDedupStrategy } from '../src/strategies/rule-based/strategy.js';
import { makeListing } from './test-helpers.js';

// Negativos difíciles hallados en datos reales (2026-11-05, decisión 277): siete habitaciones de un
// mismo piso compartido se agruparon con puntuación 0,86-0,98. Mismas coordenadas, dirección, superficie
// (la del piso entero) y número de habitaciones: lo que las separa no está en las señales acumuladas.
const shared = {
  address: 'Calle Pedro Antonio de Alarcón, 41',
  surfaceM2: 120,
  rooms: 5,
  bathrooms: 2,
  priceCents: 35_000,
} as const;

describe('puerta de tipo: `other` no confirma que sean el mismo tipo de inmueble', () => {
  it('veta dos anuncios `other` casi idénticos: pueden ser habitaciones, garajes u oficinas distintos', () => {
    const result = ruleBasedDedupStrategy.score(
      makeListing({ ...shared, propertyType: 'other', externalId: 'room-a' }),
      makeListing({ ...shared, propertyType: 'other', externalId: 'room-b' })
    );

    expect(result.signals['propertyTypeMatch']?.value).toBe(0);
    expect(result.signals['propertyTypeMatch']?.detail).toBe('tipo de inmueble sin clasificar');
    expect(isVetoed(result.signals)).toBe(true);
    expect(classify(result)).toBe('reject');
  });

  it('sigue aceptando dos anuncios idénticos de un tipo conocido', () => {
    const result = ruleBasedDedupStrategy.score(
      makeListing({ ...shared, propertyType: 'flat', externalId: 'flat-a' }),
      makeListing({ ...shared, propertyType: 'flat', externalId: 'flat-b' })
    );

    expect(result.signals['propertyTypeMatch']?.value).toBe(1);
    expect(classify(result)).toBe('accept');
  });
});

describe('puerta de planta: dos plantas conocidas y distintas no son la misma vivienda', () => {
  it('veta el mismo piso en plantas distintas, aunque todo lo demás coincida', () => {
    const result = ruleBasedDedupStrategy.score(
      makeListing({ ...shared, propertyType: 'flat', floor: '3', externalId: 'floor-3' }),
      makeListing({ ...shared, propertyType: 'flat', floor: '6', externalId: 'floor-6' })
    );

    expect(result.signals['floorMatch']).toEqual({
      value: 0,
      weight: 0,
      detail: 'planta distinta',
    });
    expect(isVetoed(result.signals)).toBe(true);
    expect(classify(result)).toBe('reject');
  });

  it('compara la planta sin distinguir mayúsculas ni espacios', () => {
    const result = ruleBasedDedupStrategy.score(
      makeListing({ ...shared, propertyType: 'flat', floor: ' BJ ', externalId: 'a' }),
      makeListing({ ...shared, propertyType: 'flat', floor: 'bj', externalId: 'b' })
    );

    expect(result.signals['floorMatch']).toEqual({ value: 1, weight: 0, detail: 'misma planta' });
    expect(classify(result)).toBe('accept');
  });

  it.each([
    ['falta en un anuncio', '3', undefined],
    ['falta en los dos', undefined, undefined],
  ])('no veta cuando la planta %s: la ausencia no es un desacuerdo', (_case, floorA, floorB) => {
    const result = ruleBasedDedupStrategy.score(
      makeListing({ ...shared, propertyType: 'flat', floor: floorA, externalId: 'a' }),
      makeListing({ ...shared, propertyType: 'flat', floor: floorB, externalId: 'b' })
    );

    expect(result.signals['floorMatch']).toEqual({
      value: 1,
      weight: 0,
      detail: 'planta no comparable',
    });
    expect(isVetoed(result.signals)).toBe(false);
  });

  it('la puerta tiene peso 0: no altera la puntuación acumulada', () => {
    const base = { ...shared, propertyType: 'flat', externalId: 'a' } as const;
    const withFloors = ruleBasedDedupStrategy.score(
      makeListing({ ...base, floor: '3' }),
      makeListing({ ...base, floor: '3' })
    );
    const withoutFloors = ruleBasedDedupStrategy.score(makeListing(base), makeListing(base));

    expect(withFloors.score).toBe(withoutFloors.score);
  });
});

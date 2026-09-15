import { describe, expect, it } from 'vitest';

import { ruleBasedDedupStrategy } from '../src/strategies/rule-based/strategy.js';
import { MIN_EFFECTIVE_WEIGHT } from '../src/strategies/rule-based/weights.js';
import type { AccumulatedSignalKey } from '../src/strategies/rule-based/weights.js';
import type { Listing } from '../src/schemas/listing.schema.js';
import { makeListing } from './test-helpers.js';

const ACCUMULATED_KEYS = ['distance', 'price', 'surface', 'addressExact', 'addressZone', 'rooms', 'bathrooms'] as const;
const GATE_KEYS = ['propertyTypeMatch', 'operationMatch'] as const;
const ALL_NINE_KEYS = [...ACCUMULATED_KEYS, ...GATE_KEYS];

// RDS-2, RDS-3, RDS-5, RDS-6, SIM-1: propiedades del `score()` de
// `ruleBasedDedupStrategy` como conjunto, independientes de qué par
// concreto se puntúe. El corpus etiquetado (dedup-corpus.test.ts) cubre el
// bandeado real; esta suite cubre la ARITMÉTICA del score.
describe('ruleBasedDedupStrategy — identidad', () => {
  it('name y version', () => {
    expect(ruleBasedDedupStrategy.name).toBe('rule-based-structured');
    expect(ruleBasedDedupStrategy.version).toBe('1.0.0');
  });
});

describe('RDS-2: el desglose siempre trae las nueve claves', () => {
  it('las nueve claves están presentes incluso cuando casi todo está ausente', () => {
    const a = makeListing({
      coordinates: undefined,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: undefined,
    });
    const b = makeListing({
      coordinates: undefined,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: undefined,
    });

    const result = ruleBasedDedupStrategy.score(a, b);

    for (const key of ALL_NINE_KEYS) {
      expect(result.signals[key]).toBeDefined();
    }
    expect(Object.keys(result.signals).sort()).toEqual([...ALL_NINE_KEYS].sort());
  });

  it('RDS-2b: addressExact Y addressZone están las dos presentes, nunca solo una', () => {
    const a = makeListing({ address: 'Piso en Calle de Sagasta 12, Madrid' });
    const b = makeListing({ address: 'Piso en Calle de Sagasta 12, Madrid' });

    const result = ruleBasedDedupStrategy.score(a, b);

    expect(result.signals['addressExact']).toBeDefined();
    expect(result.signals['addressZone']).toBeDefined();
    expect(result.signals['addressExact']?.value).toBe(1);
    expect(result.signals['addressZone']?.weight).toBe(0);
  });
});

describe('SIM-1: score ∈ [0, 1]', () => {
  it('un par con todas las señales máximas da score 1', () => {
    const a = makeListing({
      coordinates: { latitude: 40.4168, longitude: -3.7038 },
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      coordinates: { latitude: 40.4168, longitude: -3.7038 },
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const result = ruleBasedDedupStrategy.score(a, b);
    expect(result.score).toBe(1);
  });

  it('un par sin ninguna coincidencia da score bajo, nunca negativo', () => {
    const a = makeListing({
      coordinates: { latitude: 40.0, longitude: -3.0 },
      priceCents: 100_000_00,
      surfaceM2: 50,
      rooms: 1,
      bathrooms: 1,
      address: 'Calle A, Madrid',
    });
    const b = makeListing({
      coordinates: { latitude: 41.0, longitude: -4.0 },
      priceCents: 900_000_00,
      surfaceM2: 500,
      rooms: 6,
      bathrooms: 5,
      address: 'Calle B, Barcelona',
    });

    const result = ruleBasedDedupStrategy.score(a, b);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe('RDS-3a: normalización por peso efectivo — paridad premises vs. homes', () => {
  it('un par premises sin rooms/bathrooms no queda sistemáticamente por debajo de un par homes equivalente', () => {
    const sharedFields = {
      coordinates: { latitude: 40.4168, longitude: -3.7038 } as const,
      priceCents: 200_000_00,
      surfaceM2: 90,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    };

    const premisesA = makeListing({ ...sharedFields, propertyType: 'commercial', rooms: undefined, bathrooms: undefined });
    const premisesB = makeListing({ ...sharedFields, propertyType: 'commercial', rooms: undefined, bathrooms: undefined });
    const homesA = makeListing({ ...sharedFields, rooms: 3, bathrooms: 2 });
    const homesB = makeListing({ ...sharedFields, rooms: 3, bathrooms: 2 });

    const premisesResult = ruleBasedDedupStrategy.score(premisesA, premisesB);
    const homesResult = ruleBasedDedupStrategy.score(homesA, homesB);

    // Bajo normalización por peso TOTAL (110), el par premises perdería
    // 30 puntos de peso configurado y su score caería muy por debajo del
    // homes equivalente. Bajo peso EFECTIVO, ambos deben puntuar alto.
    expect(premisesResult.score).toBeGreaterThanOrEqual(0.95);
    expect(homesResult.score).toBe(1);
  });
});

describe('RDS-5: determinismo', () => {
  it('puntuar el mismo par dos veces da resultados deep-equal', () => {
    const a = makeListing({ address: 'Piso en Trafalgar, Madrid' });
    const b = makeListing({ address: 'Piso en Trafalgar, Madrid' });

    expect(ruleBasedDedupStrategy.score(a, b)).toEqual(ruleBasedDedupStrategy.score(a, b));
  });
});

describe('RDS-6: simetría exacta', () => {
  it('score(a, b) === score(b, a), con toEqual exacto (no tolerancia)', () => {
    const a = makeListing({
      coordinates: { latitude: 40.4168, longitude: -3.7038 },
      priceCents: 210_000_00,
      surfaceM2: 95,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    });
    const b = makeListing({
      coordinates: { latitude: 40.4258, longitude: -3.6928 },
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 4,
      bathrooms: 1,
      address: 'Piso en Calle de Sagasta, Trafalgar, Madrid',
    });

    expect(ruleBasedDedupStrategy.score(a, b)).toEqual(ruleBasedDedupStrategy.score(b, a));
  });
});

// RDS-4 (mitad de `score()`, no de `classify()` — `classify` no existe
// todavía en esta fase): para cada una de las siete claves acumuladas,
// construir un par donde ESA señal (más `price`, que nunca puede estar
// ausente — RDS-1a) sea la única evaluada y coincida al máximo, y probar
// que el peso efectivo resultante del desglose REAL (no la tabla de
// constantes leída directamente) se queda por debajo del piso de 55. El
// resto de la fila de RDS-4 — que ese peso insuficiente de verdad impide
// `accept` en `classify` — se prueba en rule-based-classify.test.ts (fase
// 4), donde `classify` existe.
describe('RDS-4: insuficiencia de una única señal — exhaustivo sobre las siete claves acumuladas', () => {
  const singleSignalPairs: Record<AccumulatedSignalKey, () => readonly [Listing, Listing]> = {
    distance: () => {
      const coordinates = { latitude: 40.4168, longitude: -3.7038 };
      return [makeListing({ coordinates }), makeListing({ coordinates })];
    },
    price: () => [makeListing(), makeListing()],
    surface: () => [makeListing({ surfaceM2: 90 }), makeListing({ surfaceM2: 90 })],
    addressExact: () => [
      makeListing({ address: 'Piso en Calle de Sagasta 12, Madrid' }),
      makeListing({ address: 'Piso en Calle de Sagasta 12, Madrid' }),
    ],
    addressZone: () => [
      makeListing({ address: 'Piso en Trafalgar, Madrid' }),
      makeListing({ address: 'Piso en Trafalgar, Madrid' }),
    ],
    rooms: () => [makeListing({ rooms: 3 }), makeListing({ rooms: 3 })],
    bathrooms: () => [makeListing({ bathrooms: 2 }), makeListing({ bathrooms: 2 })],
  };

  it.each(ACCUMULATED_KEYS)('%s maximizada en solitario nunca alcanza el piso de peso efectivo (55)', (key) => {
    const [a, b] = singleSignalPairs[key]();
    const result = ruleBasedDedupStrategy.score(a, b);

    const effectiveWeight = ACCUMULATED_KEYS.reduce((sum, k) => sum + (result.signals[k]?.weight ?? 0), 0);

    expect(effectiveWeight).toBeLessThan(MIN_EFFECTIVE_WEIGHT);
  });
});

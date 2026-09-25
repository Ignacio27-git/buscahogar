import { describe, expect, it } from 'vitest';

import { classify } from '../src/strategies/rule-based/classify.js';
import { MIN_EFFECTIVE_WEIGHT, MIN_EVALUATED_SIGNALS, T_HIGH, T_LOW, WEIGHTS } from '../src/strategies/rule-based/weights.js';
import type { AccumulatedSignalKey } from '../src/strategies/rule-based/weights.js';
import type { SimilarityResult } from '../src/types/similarity.js';

const ACCUMULATED_KEYS: readonly AccumulatedSignalKey[] = [
  'distance',
  'price',
  'surface',
  'addressExact',
  'addressZone',
  'rooms',
  'bathrooms',
];

// Construye un SimilarityResult literal, sin ningún Listing en scope —
// BAND-4a exige que classify sea una función pura de SimilarityResult solo,
// re-clasificable a partir de un valor persistido sin rehidratar los dos
// Listing que lo produjeron.
function literalResult(
  overrides: Partial<Record<AccumulatedSignalKey | 'propertyTypeMatch' | 'operationMatch', { value: number; weight: number }>> = {}
): SimilarityResult {
  const signals: Record<string, { value: number; weight: number }> = {
    distance: { value: 0, weight: 0 },
    price: { value: 0, weight: 0 },
    surface: { value: 0, weight: 0 },
    addressExact: { value: 0, weight: 0 },
    addressZone: { value: 0, weight: 0 },
    rooms: { value: 0, weight: 0 },
    bathrooms: { value: 0, weight: 0 },
    propertyTypeMatch: { value: 1, weight: 0 },
    operationMatch: { value: 1, weight: 0 },
    ...overrides,
  };

  const totalWeight = Object.values(signals).reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = Object.values(signals).reduce((sum, s) => sum + s.value * s.weight, 0);
  const score = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  return { score, signals };
}

describe('BAND-4a: classify es función pura de SimilarityResult, sin Listing en scope', () => {
  it('clasifica un literal construido a mano sin ningún Listing', () => {
    const result: SimilarityResult = {
      score: 0.9,
      signals: {
        distance: { value: 1, weight: 25 },
        price: { value: 1, weight: 15 },
        surface: { value: 1, weight: 15 },
        propertyTypeMatch: { value: 1, weight: 0 },
        operationMatch: { value: 1, weight: 0 },
      },
    };

    expect(classify(result)).toBe('accept');
  });
});

describe('BAND-1: frontera de umbrales, inclusiva hacia la banda exterior', () => {
  it('BAND-1a: score exactamente en T_HIGH, con el piso satisfecho, acepta', () => {
    // `classify` solo LEE `result.score` y `result.signals` (BAND-4a) — no
    // recalcula el score a partir del desglose. Fijar `score` al literal
    // exacto `T_HIGH` evita el redondeo de punto flotante que introduciría
    // reconstruirlo por álgebra inversa a partir de valores parciales.
    const result: SimilarityResult = {
      score: T_HIGH,
      signals: {
        distance: { value: 1, weight: WEIGHTS.distance },
        price: { value: 1, weight: WEIGHTS.price },
        surface: { value: 1, weight: WEIGHTS.surface },
        propertyTypeMatch: { value: 1, weight: 0 },
        operationMatch: { value: 1, weight: 0 },
      },
    };

    expect(classify(result)).toBe('accept');
  });

  it('BAND-1b: score exactamente en T_LOW rechaza', () => {
    const result: SimilarityResult = {
      score: T_LOW,
      signals: {
        distance: { value: T_LOW, weight: 100 },
        propertyTypeMatch: { value: 1, weight: 0 },
        operationMatch: { value: 1, weight: 0 },
      },
    };

    expect(classify(result)).toBe('reject');
  });

  it('BAND-1c: score por encima de T_HIGH pero sin el piso satisfecho no acepta (undecided)', () => {
    // Una única señal (price, 15 de peso) a valor máximo: score 1.0 pero muy
    // por debajo del piso de 55 — coincide con RDS-4a.
    const result = literalResult({ price: { value: 1, weight: WEIGHTS.price } });

    expect(result.score).toBe(1);
    expect(classify(result)).toBe('undecided');
  });
});

describe('BAND-2/BAND-3: el veto fuerza reject aunque el score sea alto', () => {
  it('propertyTypeMatch = 0 fuerza reject desde un score de 0.98', () => {
    const result = literalResult({
      distance: { value: 1, weight: WEIGHTS.distance },
      price: { value: 0.9, weight: WEIGHTS.price },
      surface: { value: 1, weight: WEIGHTS.surface },
      propertyTypeMatch: { value: 0, weight: 0 },
    });

    expect(result.score).toBeGreaterThan(0.9);
    expect(classify(result)).toBe('reject');
  });

  it('operationMatch = 0 fuerza reject aunque el score sea alto', () => {
    const result = literalResult({
      distance: { value: 1, weight: WEIGHTS.distance },
      price: { value: 1, weight: WEIGHTS.price },
      surface: { value: 1, weight: WEIGHTS.surface },
      operationMatch: { value: 0, weight: 0 },
    });

    expect(classify(result)).toBe('reject');
  });
});

describe('RDS-4a/RDS-4b: anclas del piso de evidencia mínima', () => {
  it('RDS-4a: una única señal maximal nunca acepta, aunque score sea 1.0', () => {
    const result = literalResult({ price: { value: 1, weight: WEIGHTS.price } });

    expect(result.score).toBe(1);
    expect(classify(result)).toBe('undecided');
  });

  it('RDS-4b: distance + price + surface exactamente al piso (55) y maximales aceptan', () => {
    const result = literalResult({
      distance: { value: 1, weight: WEIGHTS.distance },
      price: { value: 1, weight: WEIGHTS.price },
      surface: { value: 1, weight: WEIGHTS.surface },
    });

    expect(result.score).toBe(1);
    expect(classify(result)).toBe('accept');
  });
});

// ROADMAP 2.2 (decisión 088): classify acepta un segundo parámetro opcional
// `thresholds`, usado SOLO por la evaluación offline (apps/ingestion). Sin
// argumento, el comportamiento debe ser byte-idéntico al de antes de este
// cambio — nunca un parámetro en tiempo de ejecución de producción.
describe('classify(result, thresholds) — override opcional de umbrales (ROADMAP 2.2, decisión 088)', () => {
  it('sin segundo argumento, el resultado es idéntico al de pasar explícitamente los umbrales por defecto', () => {
    const result: SimilarityResult = {
      score: T_HIGH,
      signals: {
        distance: { value: 1, weight: WEIGHTS.distance },
        price: { value: 1, weight: WEIGHTS.price },
        surface: { value: 1, weight: WEIGHTS.surface },
        propertyTypeMatch: { value: 1, weight: 0 },
        operationMatch: { value: 1, weight: 0 },
      },
    };

    expect(classify(result)).toBe('accept');
    expect(classify(result, { high: T_HIGH, low: T_LOW })).toBe(classify(result));
  });

  it('un threshold `high` explícito más exigente que T_HIGH baja un accept por defecto a undecided', () => {
    // score = (25*1 + 15*1 + 15*0.6) / 55 ≈ 0.8909 — por encima de T_HIGH
    // (0.82) pero por debajo de un high explícito de 0.95.
    const result = literalResult({
      distance: { value: 1, weight: WEIGHTS.distance },
      price: { value: 1, weight: WEIGHTS.price },
      surface: { value: 0.6, weight: WEIGHTS.surface },
    });

    expect(result.score).toBeCloseTo(0.8909, 3);
    expect(classify(result)).toBe('accept');
    expect(classify(result, { high: 0.95, low: T_LOW })).toBe('undecided');
  });

  it('un threshold `high` explícito menos exigente que T_HIGH sube un undecided por defecto a accept', () => {
    // score = (25*0.5 + 15*1 + 15*1) / 55 ≈ 0.7727 — por debajo de T_HIGH
    // (0.82, así que por defecto es undecided) pero por encima de un high
    // explícito de 0.75, con el piso satisfecho (3 señales, 55 de peso).
    const result = literalResult({
      distance: { value: 0.5, weight: WEIGHTS.distance },
      price: { value: 1, weight: WEIGHTS.price },
      surface: { value: 1, weight: WEIGHTS.surface },
    });

    expect(result.score).toBeCloseTo(0.7727, 3);
    expect(classify(result)).toBe('undecided');
    expect(classify(result, { high: 0.75, low: T_LOW })).toBe('accept');
  });

  it('un threshold `low` explícito más exigente que T_LOW baja un undecided por defecto a reject', () => {
    // score = (25*0.4 + 15*0.6 + 15*0.6) / 55 ≈ 0.5091 — por encima de T_LOW
    // (0.45, así que por defecto no rechaza) pero por debajo de un low
    // explícito de 0.55.
    const result = literalResult({
      distance: { value: 0.4, weight: WEIGHTS.distance },
      price: { value: 0.6, weight: WEIGHTS.price },
      surface: { value: 0.6, weight: WEIGHTS.surface },
    });

    expect(result.score).toBeCloseTo(0.5091, 3);
    expect(classify(result)).toBe('undecided');
    expect(classify(result, { high: T_HIGH, low: 0.55 })).toBe('reject');
  });

  it('el veto sigue forzando reject bajo CUALQUIER threshold, incluso el más permisivo posible', () => {
    const result = literalResult({
      distance: { value: 1, weight: WEIGHTS.distance },
      price: { value: 1, weight: WEIGHTS.price },
      surface: { value: 1, weight: WEIGHTS.surface },
      propertyTypeMatch: { value: 0, weight: 0 },
    });

    expect(result.score).toBeGreaterThan(0.9);
    expect(classify(result, { high: 0.01, low: 0 })).toBe('reject');
  });

  it('el piso de evidencia mínima sigue bloqueando accept bajo CUALQUIER threshold, incluso el más permisivo posible', () => {
    // Una única señal evaluada (price, peso 15): score 1.0, pero
    // evaluatedSignals = 1 < MIN_EVALUATED_SIGNALS = 3 — el piso nunca se
    // satisface, sin importar cuán bajo sea el threshold `high`.
    const result = literalResult({ price: { value: 1, weight: WEIGHTS.price } });

    expect(result.score).toBe(1);
    expect(classify(result, { high: 0.01, low: 0 })).not.toBe('accept');
  });
});

// RDS-4 (piso completo): enumera las 2^7 combinaciones de qué claves
// acumuladas están "evaluadas" (peso máximo) frente a "ausentes" (peso 0),
// todas a valor 1 cuando están evaluadas. Ninguna combinación con menos de
// 3 señales evaluadas alcanza nunca los 55 de peso efectivo — es una
// invariante de las propias constantes de peso (decisión 049), probada
// aquí de forma exhaustiva en vez de solo en los dos casos ancla.
describe('RDS-4: el piso, probado exhaustivamente sobre las 2^7 combinaciones de señales', () => {
  const subsetCount = 2 ** ACCUMULATED_KEYS.length;

  it.each(Array.from({ length: subsetCount }, (_unused, mask) => mask))(
    'combinación %i: si hay menos de 3 señales evaluadas, el piso nunca se satisface',
    (mask) => {
      const overrides: Partial<Record<AccumulatedSignalKey, { value: number; weight: number }>> = {};
      let evaluatedCount = 0;
      let effectiveWeight = 0;

      ACCUMULATED_KEYS.forEach((key, index) => {
        const isEvaluated = (mask & (1 << index)) !== 0;
        if (isEvaluated) {
          overrides[key] = { value: 1, weight: WEIGHTS[key] };
          evaluatedCount += 1;
          effectiveWeight += WEIGHTS[key];
        }
      });

      const floorSatisfied = evaluatedCount >= MIN_EVALUATED_SIGNALS && effectiveWeight >= MIN_EFFECTIVE_WEIGHT;

      if (evaluatedCount < 3) {
        expect(floorSatisfied).toBe(false);
      }

      const result = literalResult(overrides);
      const band = classify(result);

      if (!floorSatisfied) {
        expect(band).not.toBe('accept');
      }
    }
  );
});

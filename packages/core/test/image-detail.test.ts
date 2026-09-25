// ROADMAP 2.3 — formatImageDetail/parseImageDetail (spec "Breakdown Detail
// Is Deterministic and Parseable", design "Vocabulary and detail contract
// F3/F4"): codificación de texto determinista y con parseo inverso exacto.
// Orden de claves fijo: level, reason, distance, threshold.
import { describe, expect, it } from 'vitest';

import type { ImageComparison } from '../src/strategies/image/compare.js';
import { formatImageDetail, parseImageDetail } from '../src/strategies/image/detail.js';

describe('formatImageDetail (ROADMAP 2.3, F3/F4)', () => {
  it('produce el formato exacto level=<level>;reason=<reason>;distance=<int>;threshold=<int>', () => {
    const comparison: ImageComparison = {
      level: 'strong',
      reason: 'match',
      distance: 4,
      threshold: 8,
    };

    expect(formatImageDetail(comparison)).toBe('level=strong;reason=match;distance=4;threshold=8');
  });

  it('distance=n/a cuando distance es null (missing/unreadable)', () => {
    const missing: ImageComparison = {
      level: 'neutral',
      reason: 'missing',
      distance: null,
      threshold: 8,
    };
    const unreadable: ImageComparison = {
      level: 'neutral',
      reason: 'unreadable',
      distance: null,
      threshold: 8,
    };

    expect(formatImageDetail(missing)).toBe(
      'level=neutral;reason=missing;distance=n/a;threshold=8'
    );
    expect(formatImageDetail(unreadable)).toBe(
      'level=neutral;reason=unreadable;distance=n/a;threshold=8'
    );
  });

  it('distance numérica en low-entropy y above-threshold', () => {
    const lowEntropy: ImageComparison = {
      level: 'neutral',
      reason: 'low-entropy',
      distance: 3,
      threshold: 8,
    };
    const aboveThreshold: ImageComparison = {
      level: 'neutral',
      reason: 'above-threshold',
      distance: 12,
      threshold: 8,
    };

    expect(formatImageDetail(lowEntropy)).toBe(
      'level=neutral;reason=low-entropy;distance=3;threshold=8'
    );
    expect(formatImageDetail(aboveThreshold)).toBe(
      'level=neutral;reason=above-threshold;distance=12;threshold=8'
    );
  });
});

describe('parseImageDetail (ROADMAP 2.3, F3/F4)', () => {
  const CASES: readonly ImageComparison[] = [
    { level: 'strong', reason: 'match', distance: 4, threshold: 8 },
    { level: 'neutral', reason: 'above-threshold', distance: 12, threshold: 8 },
    { level: 'neutral', reason: 'missing', distance: null, threshold: 8 },
    { level: 'neutral', reason: 'unreadable', distance: null, threshold: 8 },
    { level: 'neutral', reason: 'low-entropy', distance: 3, threshold: 8 },
  ];

  it.each(CASES)(
    'hace round-trip exacto de todo lo que produce formatImageDetail: %j',
    (comparison) => {
      const formatted = formatImageDetail(comparison);

      expect(parseImageDetail(formatted)).toEqual(comparison);
    }
  );

  it('lanza RangeError si falta una clave o el número de campos es incorrecto', () => {
    expect(() => parseImageDetail('level=strong;reason=match;distance=4')).toThrow(RangeError);
    expect(() =>
      parseImageDetail('level=strong;reason=match;distance=4;threshold=8;extra=1')
    ).toThrow(RangeError);
  });

  it('lanza RangeError si el orden de las claves es incorrecto', () => {
    expect(() => parseImageDetail('reason=match;level=strong;distance=4;threshold=8')).toThrow(
      RangeError
    );
  });

  it('lanza RangeError ante un level desconocido', () => {
    expect(() => parseImageDetail('level=weak;reason=match;distance=4;threshold=8')).toThrow(
      RangeError
    );
  });

  it('lanza RangeError ante un reason desconocido', () => {
    expect(() => parseImageDetail('level=strong;reason=exact;distance=4;threshold=8')).toThrow(
      RangeError
    );
  });

  it('lanza RangeError si distance o threshold no son enteros', () => {
    expect(() => parseImageDetail('level=strong;reason=match;distance=4.5;threshold=8')).toThrow(
      RangeError
    );
    expect(() => parseImageDetail('level=strong;reason=match;distance=4;threshold=abc')).toThrow(
      RangeError
    );
  });
});

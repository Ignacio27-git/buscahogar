// ROADMAP 2.3 — combinadores de imagen (decisión 094): RB-strong recalcula
// la media ponderada sobre `{...base.signals, image}` en orden de inserción
// (mismo criterio que rule-based/strategy.ts); FS-strong añade
// log2(0.30/0.05)≈2.585 bits, weight 1, a M. Ambos combinadores devuelven
// `{value:0,weight:0,detail}` en el caso neutral y NUNCA tocan `base.score`.
import { describe, expect, it } from 'vitest';

import type { ImageComparison } from '../src/strategies/image/compare.js';
import {
  probabilisticImageCombiner,
  ruleBasedImageCombiner,
} from '../src/strategies/image/combiners.js';
import type { SimilarityResult } from '../src/types/similarity.js';

const STRONG: ImageComparison = { level: 'strong', reason: 'match', distance: 3, threshold: 8 };
const NEUTRAL: ImageComparison = {
  level: 'neutral',
  reason: 'above-threshold',
  distance: 20,
  threshold: 8,
};

describe('ruleBasedImageCombiner (ROADMAP 2.3, decisión 094)', () => {
  it('neutral: {value:0,weight:0,detail}, base.score sin cambios', () => {
    const base: SimilarityResult = {
      score: 0.6,
      signals: { distance: { value: 1, weight: 25 }, price: { value: 0.5, weight: 15 } },
    };

    const combined = ruleBasedImageCombiner(base, NEUTRAL);

    expect(combined.score).toBe(base.score);
    expect(combined.signals['image']).toMatchObject({ value: 0, weight: 0 });
    expect(typeof combined.signals['image']?.detail).toBe('string');
    expect(combined.signals['distance']).toBe(base.signals['distance']);
    expect(combined.signals['price']).toBe(base.signals['price']);
  });

  it('strong: recalcula la media ponderada incluyendo image {value:1,weight:15} en orden de inserción', () => {
    const base: SimilarityResult = {
      score: 0.4, // deliberadamente distinto del recálculo, para probar que SÍ se recalcula
      signals: {
        distance: { value: 1, weight: 25 },
        price: { value: 1, weight: 15 },
      },
    };

    const combined = ruleBasedImageCombiner(base, STRONG);

    // (1*25 + 1*15 + 1*15) / (25+15+15) = 55/55 = 1
    expect(combined.score).toBe(1);
    expect(combined.signals['image']).toMatchObject({ value: 1, weight: 15 });
  });

  it('strong con evidencia mixta: la media recalculada refleja los tres pesos, no solo image', () => {
    const base: SimilarityResult = {
      score: 0.9,
      signals: {
        distance: { value: 0, weight: 25 }, // discrepancia total en distancia
        price: { value: 1, weight: 15 },
      },
    };

    const combined = ruleBasedImageCombiner(base, STRONG);

    // (0*25 + 1*15 + 1*15) / (25+15+15) = 30/55
    expect(combined.score).toBeCloseTo(30 / 55, 10);
  });
});

describe('probabilisticImageCombiner (ROADMAP 2.3, decisión 094)', () => {
  it('neutral: {value:0,weight:0,detail}, base.score sin cambios', () => {
    const base: SimilarityResult = {
      score: 0.73,
      signals: { prior: { value: -3.17, weight: 1 }, distance: { value: 1.81, weight: 1 } },
    };

    const combined = probabilisticImageCombiner(base, NEUTRAL);

    expect(combined.score).toBe(base.score);
    expect(combined.signals['image']).toMatchObject({ value: 0, weight: 0 });
    expect(typeof combined.signals['image']?.detail).toBe('string');
  });

  it('strong: añade log2(0.30/0.05) bits a M con weight 1', () => {
    const priorValue = -3.169925001442312; // log2(0.1/0.9), mismo valor que PRIOR_LOG_ODDS
    const base: SimilarityResult = {
      score: 1 / (1 + Math.pow(2, -priorValue)),
      signals: { prior: { value: priorValue, weight: 1 } },
    };

    const combined = probabilisticImageCombiner(base, STRONG);

    const expectedImageBits = Math.log2(0.3 / 0.05);
    const expectedM = priorValue + expectedImageBits;
    const expectedScore = 1 / (1 + Math.pow(2, -expectedM));

    expect(combined.signals['image']).toMatchObject({ weight: 1 });
    expect((combined.signals['image'] as { value: number }).value).toBeCloseTo(
      expectedImageBits,
      10
    );
    expect(combined.score).toBeCloseTo(expectedScore, 10);
  });

  it('strong: los campos ausentes (weight 0) no participan en M, igual que en levels.ts (MAR-exclude)', () => {
    const priorValue = -3.169925001442312;
    const base: SimilarityResult = {
      score: 0.5,
      signals: {
        prior: { value: priorValue, weight: 1 },
        distance: { value: 0, weight: 0 }, // ausente — no debe sumar a M
      },
    };

    const combined = probabilisticImageCombiner(base, STRONG);

    const expectedM = priorValue + Math.log2(0.3 / 0.05);
    const expectedScore = 1 / (1 + Math.pow(2, -expectedM));

    expect(combined.score).toBeCloseTo(expectedScore, 10);
  });
});

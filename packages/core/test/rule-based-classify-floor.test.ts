// ROADMAP 2.3 — classifyRuleBasedWithImage (spec "Rule-Based Evidence Floor
// Excludes the Image Signal", decisión 094): la señal de imagen NUNCA cuenta
// para el piso de evidencia (MIN_EVALUATED_SIGNALS/MIN_EFFECTIVE_WEIGHT) del
// evaluador rule-based, aunque SÍ puede subir el score. La prueba central
// (RDS-4 extendida) refleja md-4: 2 señales estructuradas evaluadas, peso 40
// — por debajo del piso (55) — más una imagen strong.
import { describe, expect, it } from 'vitest';

import { classify } from '../src/strategies/rule-based/classify.js';
import { classifyRuleBasedWithImage } from '../src/strategies/image/classify.js';
import type { SimilarityResult } from '../src/types/similarity.js';

// Mismos dos signals estructurados que md-4 (distance 25, price 15 — el
// resto ausente), MÁS una imagen strong a peso 15: score = 1.0
// (25+15+15)/(25+15+15) — deliberadamente alto para aislar el efecto del
// piso, no del umbral de score.
function mdFourLikeResultWithStrongImage(): SimilarityResult {
  const signals = {
    distance: { value: 1, weight: 25 },
    price: { value: 1, weight: 15 },
    surface: { value: 0, weight: 0 },
    addressExact: { value: 0, weight: 0 },
    addressZone: { value: 0, weight: 0 },
    rooms: { value: 0, weight: 0 },
    bathrooms: { value: 0, weight: 0 },
    propertyTypeMatch: { value: 1, weight: 0 },
    operationMatch: { value: 1, weight: 0 },
    image: { value: 1, weight: 15, detail: 'level=strong;reason=match;distance=2;threshold=8' },
  };
  const totalWeight = Object.values(signals).reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = Object.values(signals).reduce((sum, s) => sum + s.value * s.weight, 0);
  return { score: weightedSum / totalWeight, signals };
}

describe('classifyRuleBasedWithImage excluye la imagen del piso de evidencia (RDS-4, decisión 094)', () => {
  it('md-4 + imagen strong se queda undecided bajo classifyRuleBasedWithImage (el piso solo ve 2 señales, peso 40)', () => {
    const result = mdFourLikeResultWithStrongImage();

    expect(result.score).toBe(1); // score máximo — si el piso contara la imagen, sería accept

    expect(classifyRuleBasedWithImage(result)).toBe('undecided');
  });

  it('el mismo SimilarityResult bajo el classify base (sin excluir) SÍ llega a accept — prueba que la exclusión es la causa', () => {
    const result = mdFourLikeResultWithStrongImage();

    expect(classify(result)).toBe('accept');
  });

  it('un resultado que YA satisface el piso con señales estructuradas solas puede subir de score sin perder accept', () => {
    // 3 señales estructuradas evaluadas (distance, price, surface), peso
    // 25+15+15=55 — el piso YA está satisfecho sin ninguna imagen. Valor
    // 0.9 (no 1) deliberadamente: deja margen para que sumar la imagen SÍ
    // suba el score medible, sin dejar de superar T_HIGH=0.82 en ningún
    // momento.
    const signals = {
      distance: { value: 0.9, weight: 25 },
      price: { value: 0.9, weight: 15 },
      surface: { value: 0.9, weight: 15 },
      addressExact: { value: 0, weight: 0 },
      addressZone: { value: 0, weight: 0 },
      rooms: { value: 0, weight: 0 },
      bathrooms: { value: 0, weight: 0 },
      propertyTypeMatch: { value: 1, weight: 0 },
      operationMatch: { value: 1, weight: 0 },
    };
    const totalWeightWithoutImage = Object.values(signals).reduce((sum, s) => sum + s.weight, 0);
    const weightedSumWithoutImage = Object.values(signals).reduce(
      (sum, s) => sum + s.value * s.weight,
      0
    );
    const withoutImage: SimilarityResult = {
      score: weightedSumWithoutImage / totalWeightWithoutImage,
      signals,
    };

    expect(classifyRuleBasedWithImage(withoutImage)).toBe('accept');

    const withImage = {
      ...signals,
      image: { value: 1, weight: 15, detail: 'level=strong;reason=match;distance=1;threshold=8' },
    };
    const totalWeightWithImage = Object.values(withImage).reduce((sum, s) => sum + s.weight, 0);
    const weightedSumWithImage = Object.values(withImage).reduce(
      (sum, s) => sum + s.value * s.weight,
      0
    );
    const scoreWithImage = weightedSumWithImage / totalWeightWithImage;
    const resultWithImage: SimilarityResult = { score: scoreWithImage, signals: withImage };

    expect(scoreWithImage).toBeGreaterThan(withoutImage.score);
    expect(classifyRuleBasedWithImage(resultWithImage)).toBe('accept');
  });
});

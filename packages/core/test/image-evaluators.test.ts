// createImageEvaluators (ROADMAP 2.3, Phase 4, decisión 094): construye los
// dos StrategyEvaluator decorados con la señal de imagen — RB+image
// (classifyRuleBasedWithImage, umbrales de rule-based) y FS+image
// (classifyProbabilistic, umbrales de FS) — cada uno envolviendo su
// estrategia base con `withImageSignal(base, {lookup, threshold:
// IMAGE_HAMMING_THRESHOLD, combiner})`. El combinador concreto usado por
// cada evaluador es interno (ruleBasedImageCombiner/probabilisticImageCombiner,
// barrel.test.ts) — este test comprueba el comportamiento observable (name,
// classify, thresholds, imageEvidence), no qué combinador exacto se pasó.
import { describe, expect, it } from 'vitest';

import { createImageEvaluators } from '../src/evaluation/image-evaluators.js';
import { classifyRuleBasedWithImage } from '../src/strategies/image/classify.js';
import { createImageHashLookup } from '../src/strategies/image/lookup.js';
import { IMAGE_HAMMING_THRESHOLD } from '../src/strategies/image/parameters.js';
import { classifyProbabilistic, FS_BAND_THRESHOLDS } from '../src/strategies/probabilistic/classify.js';
import { RULE_BASED_BAND_THRESHOLDS } from '../src/strategies/rule-based/weights.js';
import { makeListing } from '../src/evaluation/make-listing.js';

const EMPTY_LOOKUP = createImageHashLookup({});

describe('createImageEvaluators (ROADMAP 2.3, decisión 094)', () => {
  it('ruleBasedWithImage: classify=classifyRuleBasedWithImage, defaultThresholds=RULE_BASED_BAND_THRESHOLDS', () => {
    const { ruleBasedWithImage } = createImageEvaluators(EMPTY_LOOKUP);

    expect(ruleBasedWithImage.classify).toBe(classifyRuleBasedWithImage);
    expect(ruleBasedWithImage.defaultThresholds).toEqual(RULE_BASED_BAND_THRESHOLDS);
    expect(ruleBasedWithImage.strategy.name).toBe('rule-based-structured+image-phash');
    expect(ruleBasedWithImage.strategy.version).toBe(`1.0.0+phash-t${String(IMAGE_HAMMING_THRESHOLD)}`);
  });

  it('probabilisticWithImage: classify=classifyProbabilistic, defaultThresholds=FS_BAND_THRESHOLDS', () => {
    const { probabilisticWithImage } = createImageEvaluators(EMPTY_LOOKUP);

    expect(probabilisticWithImage.classify).toBe(classifyProbabilistic);
    expect(probabilisticWithImage.defaultThresholds).toEqual(FS_BAND_THRESHOLDS);
    expect(probabilisticWithImage.strategy.name).toBe('probabilistic-fellegi-sunter+image-phash');
  });

  it('cada evaluador expone imageEvidence, que delega en compare() de la estrategia decorada (mismo threshold)', () => {
    const { ruleBasedWithImage } = createImageEvaluators(EMPTY_LOOKUP);
    const a = makeListing({ thumbnailUrl: 'fixture-image:eval/x-a' });
    const b = makeListing({ thumbnailUrl: 'fixture-image:eval/x-b' });

    expect(typeof ruleBasedWithImage.imageEvidence).toBe('function');
    const comparison = ruleBasedWithImage.imageEvidence(a, b);
    // Lookup vacío: ninguna ref resuelve a nada, así que la comparación es
    // 'missing' con el umbral calibrado real — prueba que el threshold
    // pasado a withImageSignal es IMAGE_HAMMING_THRESHOLD, no un valor
    // arbitrario.
    expect(comparison).toEqual({ level: 'neutral', reason: 'missing', distance: null, threshold: IMAGE_HAMMING_THRESHOLD });
  });

  it('los dos evaluadores usan estrategias base distintas (rule-based vs. probabilística), nunca la misma', () => {
    const { ruleBasedWithImage, probabilisticWithImage } = createImageEvaluators(EMPTY_LOOKUP);

    expect(ruleBasedWithImage.strategy.name).not.toBe(probabilisticWithImage.strategy.name);
  });
});

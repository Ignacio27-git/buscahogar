// ROADMAP 2.2 — DEFAULT_SWEEP/evaluateStrategy (decisión 091): rejilla de 20
// tuplas y evaluación por estrategia sobre el corpus etiquetado, puntuando
// cada par UNA sola vez con independencia del tamaño de la rejilla (BAND-4:
// el score no depende del umbral).
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVALUATORS,
  DEFAULT_SWEEP,
  evaluateStrategy,
  PROBABILISTIC_EVALUATOR,
  RULE_BASED_EVALUATOR,
} from '../src/evaluation/evaluate.js';
import { dedupCorpus } from '../src/evaluation/dedup-corpus.js';
import type { DedupStrategy } from '../src/contracts/dedup-strategy.js';
import type { Listing } from '../src/schemas/listing.schema.js';

describe('DEFAULT_SWEEP — 20 tuplas, todas low<high, incluye ambos umbrales por defecto (decisión 091)', () => {
  it('tiene exactamente 20 combinaciones', () => {
    expect(DEFAULT_SWEEP).toHaveLength(20);
  });

  it('toda tupla cumple low < high', () => {
    for (const { low, high } of DEFAULT_SWEEP) {
      expect(low).toBeLessThan(high);
    }
  });

  it('contiene el punto por defecto de rule-based {high:0.82,low:0.45}', () => {
    expect(DEFAULT_SWEEP).toContainEqual({ high: 0.82, low: 0.45 });
  });

  it('contiene el punto por defecto de FS {high:0.95,low:0.50}', () => {
    expect(DEFAULT_SWEEP).toContainEqual({ high: 0.95, low: 0.5 });
  });
});

describe('evaluateStrategy — puntúa cada par UNA vez, independientemente del tamaño de la rejilla (BAND-4)', () => {
  it('el número de invocaciones a strategy.score es igual al tamaño del corpus, nunca corpus×rejilla', () => {
    let calls = 0;
    const countingStrategy: DedupStrategy = {
      name: 'counting-test-strategy',
      version: '0.0.0',
      score: (a: Listing, b: Listing) => {
        calls += 1;
        return RULE_BASED_EVALUATOR.strategy.score(a, b);
      },
    };

    evaluateStrategy(
      dedupCorpus,
      { strategy: countingStrategy, defaultThresholds: { high: 0.82, low: 0.45 }, classify: RULE_BASED_EVALUATOR.classify },
      DEFAULT_SWEEP
    );

    expect(calls).toBe(dedupCorpus.length);
  });

  it('rule-based al umbral por defecto reproduce el `expected` de las 24 entradas (classify() sin cambio de comportamiento)', () => {
    const evaluation = evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, []);

    expect(evaluation.pairs).toHaveLength(24);
    for (const pair of evaluation.pairs) {
      const entry = dedupCorpus.find((e) => e.id === pair.id);
      expect(entry).toBeDefined();
      expect(pair.band).toBe(entry?.expected);
    }
  });

  it('toda entrada evaluada lleva su truth, tomado del corpus, nunca de expected', () => {
    const evaluation = evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, []);

    for (const pair of evaluation.pairs) {
      const entry = dedupCorpus.find((e) => e.id === pair.id);
      expect(pair.truth).toBe(entry?.truth);
    }
  });

  it('un punto de la rejilla que coincide con el umbral por defecto reproduce exactamente atDefault', () => {
    const evaluation = evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, [RULE_BASED_EVALUATOR.defaultThresholds]);

    expect(evaluation.sweep).toHaveLength(1);
    expect(evaluation.sweep[0]?.metrics).toEqual(evaluation.atDefault);
  });

  it('cada SweepPoint reparte el corpus completo entre sus 6 casillas de confusión (ningún par se pierde ni se duplica)', () => {
    const evaluation = evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, DEFAULT_SWEEP);

    expect(evaluation.sweep).toHaveLength(20);
    for (const point of evaluation.sweep) {
      const { counts } = point.metrics;
      const total =
        counts.truePositive +
        counts.falsePositive +
        counts.falseNegative +
        counts.trueNegative +
        counts.undecidedDuplicate +
        counts.undecidedDistinct;
      expect(total).toBe(dedupCorpus.length);
    }
  });

  it('la evaluación probabilística usa FS_BAND_THRESHOLDS y classifyProbabilistic (name/thresholds propios, no los de rule-based)', () => {
    const evaluation = evaluateStrategy(dedupCorpus, PROBABILISTIC_EVALUATOR, []);

    expect(evaluation.name).toBe('probabilistic-fellegi-sunter');
    expect(evaluation.defaultThresholds).toEqual({ high: 0.95, low: 0.5 });
    expect(evaluation.pairs).toHaveLength(24);
  });

  it('DEFAULT_EVALUATORS contiene rule-based y FS, en ese orden', () => {
    expect(DEFAULT_EVALUATORS).toEqual([RULE_BASED_EVALUATOR, PROBABILISTIC_EVALUATOR]);
  });
});

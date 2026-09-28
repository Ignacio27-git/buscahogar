// evaluateStrategy + señal de imagen (ROADMAP 2.3, Phase 4): `PairEvaluation
// .image`/`StrategyEvaluation.image` se poblan SOLO cuando el evaluador
// aporta `imageEvidence` — con un evaluador estructurado-solo (RULE_BASED_
// EVALUATOR/PROBABILISTIC_EVALUATOR) la salida es byte-idéntica a ROADMAP
// 2.2 (spec "Structured-Only Rows Reproduce 2.2 Metrics Exactly"). md-4
// stays `undecided` bajo RB+image incluso con un match fuerte de imagen
// (spec "Strong image match does not promote a pair below the structured
// floor" / decisión 094, RDS-4).
import { describe, expect, it } from 'vitest';

import { withCorpusImages } from '../src/evaluation/dedup-corpus-images.js';
import { dedupCorpus } from '../src/evaluation/dedup-corpus.js';
import { evaluateStrategy, PROBABILISTIC_EVALUATOR, RULE_BASED_EVALUATOR } from '../src/evaluation/evaluate.js';
import { createImageEvaluators } from '../src/evaluation/image-evaluators.js';
import type { ImageHashEntry } from '../src/strategies/image/compare.js';
import { createImageHashLookup } from '../src/strategies/image/lookup.js';

// Recorte de ROADMAP 2.2 (obs de este mismo lote, capturado ANTES de
// modificar evaluate.ts): `atDefault` crudo de RULE_BASED_EVALUATOR y
// PROBABILISTIC_EVALUATOR sobre `dedupCorpus`, sin rejilla. Comparar contra
// esto, no contra un recálculo, es lo único que demuestra "byte-idéntico",
// no solo "sigue siendo razonable".
const RB_2_2_AT_DEFAULT = {
  counts: { truePositive: 8, falsePositive: 1, falseNegative: 0, trueNegative: 7, undecidedDuplicate: 2, undecidedDistinct: 6 },
  precision: { value: 0.8888888888888888, successes: 8, trials: 9, wilson95: { low: 0.5650002944233439, high: 0.980109112361455 } },
  recall: { value: 0.8, successes: 8, trials: 10, wilson95: { low: 0.4901624715366418, high: 0.9433178485456247 } },
  f1: 0.8421052631578948,
  undecidedRate: { value: 0.3333333333333333, successes: 8, trials: 24, wilson95: { low: 0.17972190327297752, high: 0.5329368316186825 } },
};

const FS_2_2_AT_DEFAULT = {
  counts: { truePositive: 4, falsePositive: 1, falseNegative: 0, trueNegative: 12, undecidedDuplicate: 6, undecidedDistinct: 1 },
  precision: { value: 0.8, successes: 4, trials: 5, wilson95: { low: 0.37553462976252533, high: 0.9637758913675698 } },
  recall: { value: 0.4, successes: 4, trials: 10, wilson95: { low: 0.16818032970623617, high: 0.6873262302663417 } },
  f1: 0.5333333333333333,
  undecidedRate: { value: 0.2916666666666667, successes: 7, trials: 24, wilson95: { low: 0.14914648196960872, high: 0.49167693664496637 } },
};

describe('evaluateStrategy — evaluador estructurado-solo: salida byte-idéntica a ROADMAP 2.2 (spec)', () => {
  it('RULE_BASED_EVALUATOR: atDefault reproduce exactamente las cifras de 2.2, sin campo image', () => {
    const evaluation = evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, []);

    expect(evaluation.atDefault).toEqual(RB_2_2_AT_DEFAULT);
    expect(evaluation.image).toBeUndefined();
    for (const pair of evaluation.pairs) {
      expect(pair.image).toBeUndefined();
    }
  });

  it('PROBABILISTIC_EVALUATOR: atDefault reproduce exactamente las cifras de 2.2, sin campo image', () => {
    const evaluation = evaluateStrategy(dedupCorpus, PROBABILISTIC_EVALUATOR, []);

    expect(evaluation.atDefault).toEqual(FS_2_2_AT_DEFAULT);
    expect(evaluation.image).toBeUndefined();
    for (const pair of evaluation.pairs) {
      expect(pair.image).toBeUndefined();
    }
  });
});

describe('evaluateStrategy — evaluador con imageEvidence: PairEvaluation.image/StrategyEvaluation.image poblados', () => {
  // Lookup sintético: TODA ref conocida hashea a un valor IDÉNTICO —
  // distancia 0 entre cualquier pareja con los dos lados presentes, así que
  // cada par con imagen en ambos lados puntúa 'strong' salvo md-3 (lado b
  // sin ref, 'missing' por diseño).
  const IDENTICAL_HASH: ImageHashEntry = { kind: 'hashed', hash: 'aaaaaaaaaaaaaaaa', lowEntropy: false };
  const withImages = withCorpusImages(dedupCorpus);
  const refs = new Set<string>();
  for (const entry of withImages) {
    if (entry.a.thumbnailUrl !== undefined) refs.add(entry.a.thumbnailUrl);
    if (entry.b.thumbnailUrl !== undefined) refs.add(entry.b.thumbnailUrl);
  }
  const table: Record<string, ImageHashEntry> = {};
  for (const ref of refs) table[ref] = IDENTICAL_HASH;
  const lookup = createImageHashLookup(table);
  const { ruleBasedWithImage, probabilisticWithImage } = createImageEvaluators(lookup);

  it('cada PairEvaluation lleva su image (ImageComparison), y md-3 resuelve missing', () => {
    const evaluation = evaluateStrategy(withImages, ruleBasedWithImage, []);

    expect(evaluation.pairs).toHaveLength(24);
    for (const pair of evaluation.pairs) {
      expect(pair.image).toBeDefined();
    }

    const md3 = evaluation.pairs.find((pair) => pair.id === 'md-3-direccion-ausente-ambos-lados');
    expect(md3?.image?.level).toBe('neutral');
    expect(md3?.image?.reason).toBe('missing');

    const tp1 = evaluation.pairs.find((pair) => pair.id === 'tp-1-mismo-anuncio-cerca');
    expect(tp1?.image?.level).toBe('strong');
    expect(tp1?.image?.reason).toBe('match');
  });

  it('StrategyEvaluation.image.threshold queda poblado cuando el evaluador aporta imageEvidence', () => {
    const evaluation = evaluateStrategy(withImages, ruleBasedWithImage, []);

    expect(evaluation.image).toEqual({ threshold: ruleBasedWithImage.imageThreshold });
  });

  it('md-4 sigue undecided bajo RB+image incluso con match fuerte de imagen (RDS-4, decisión 094)', () => {
    const evaluation = evaluateStrategy(withImages, ruleBasedWithImage, []);
    const md4 = evaluation.pairs.find((pair) => pair.id === 'md-4-solo-dos-senales-evaluables');

    expect(md4?.image?.level).toBe('strong');
    expect(md4?.band).toBe('undecided');
  });

  it('FS+image: no tiene piso de evidencia, así que el mismo lookup sintético puede promover otros pares (no se afirma nada de md-4 aquí)', () => {
    const evaluation = evaluateStrategy(withImages, probabilisticWithImage, []);

    expect(evaluation.image).toEqual({ threshold: probabilisticWithImage.imageThreshold });
    for (const pair of evaluation.pairs) {
      expect(pair.image).toBeDefined();
    }
  });
});

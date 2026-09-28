// createImageEvaluators (ROADMAP 2.3, Phase 4, decisión 094): construye los
// dos StrategyEvaluator decorados con la señal de imagen — mismos umbrales
// de banda que sus contrapartes estructuradas-solo (RULE_BASED_EVALUATOR/
// PROBABILISTIC_EVALUATOR, evaluate.ts), solo cambian `strategy` (envuelta
// por `withImageSignal`), `classify` (RB usa `classifyRuleBasedWithImage`
// para excluir la imagen del piso de evidencia — decisión 094; FS reutiliza
// `classifyProbabilistic` sin cambios, ya que la estrategia probabilística
// no tiene piso de evidencia) e `imageEvidence`/`imageThreshold`, que
// `evaluateStrategy` (evaluate.ts) usa para poblar `PairEvaluation.image` y
// `StrategyEvaluation.image`.
import type { Listing } from '../schemas/listing.schema.js';
import { classifyProbabilistic, FS_BAND_THRESHOLDS } from '../strategies/probabilistic/classify.js';
import { probabilisticDedupStrategy } from '../strategies/probabilistic/strategy.js';
import { ruleBasedDedupStrategy } from '../strategies/rule-based/strategy.js';
import { RULE_BASED_BAND_THRESHOLDS } from '../strategies/rule-based/weights.js';
import { classifyRuleBasedWithImage } from '../strategies/image/classify.js';
import { probabilisticImageCombiner, ruleBasedImageCombiner } from '../strategies/image/combiners.js';
import type { ImageComparison } from '../strategies/image/compare.js';
import type { ImageHashLookup } from '../strategies/image/lookup.js';
import { IMAGE_HAMMING_THRESHOLD } from '../strategies/image/parameters.js';
import { withImageSignal } from '../strategies/image/with-image-signal.js';
import type { StrategyEvaluator } from './evaluate.js';

// `StrategyEvaluator.imageEvidence`/`.imageThreshold` (evaluate.ts, tarea
// 4.9) son OPCIONALES — un evaluador estructurado-solo nunca los aporta.
// `ImageStrategyEvaluator` estrecha esos dos campos a obligatorios: todo
// evaluador que `createImageEvaluators` construye los lleva SIEMPRE, así que
// los llamadores de este módulo (report.ts, tarea 4.16) no necesitan volver
// a comprobar `!== undefined`.
export interface ImageStrategyEvaluator extends StrategyEvaluator {
  readonly imageEvidence: (a: Listing, b: Listing) => ImageComparison;
  readonly imageThreshold: number;
}

export interface ImageEvaluators {
  readonly ruleBasedWithImage: ImageStrategyEvaluator;
  readonly probabilisticWithImage: ImageStrategyEvaluator;
}

export function createImageEvaluators(lookup: ImageHashLookup): ImageEvaluators {
  const ruleBasedImageStrategy = withImageSignal(ruleBasedDedupStrategy, {
    lookup,
    threshold: IMAGE_HAMMING_THRESHOLD,
    combiner: ruleBasedImageCombiner,
  });
  const probabilisticImageStrategy = withImageSignal(probabilisticDedupStrategy, {
    lookup,
    threshold: IMAGE_HAMMING_THRESHOLD,
    combiner: probabilisticImageCombiner,
  });

  const ruleBasedImageEvidence = (a: Listing, b: Listing): ImageComparison => ruleBasedImageStrategy.compare(a, b);
  const probabilisticImageEvidence = (a: Listing, b: Listing): ImageComparison =>
    probabilisticImageStrategy.compare(a, b);

  return {
    ruleBasedWithImage: {
      strategy: ruleBasedImageStrategy,
      defaultThresholds: RULE_BASED_BAND_THRESHOLDS,
      classify: classifyRuleBasedWithImage,
      imageEvidence: ruleBasedImageEvidence,
      imageThreshold: IMAGE_HAMMING_THRESHOLD,
    },
    probabilisticWithImage: {
      strategy: probabilisticImageStrategy,
      defaultThresholds: FS_BAND_THRESHOLDS,
      classify: classifyProbabilistic,
      imageEvidence: probabilisticImageEvidence,
      imageThreshold: IMAGE_HAMMING_THRESHOLD,
    },
  };
}

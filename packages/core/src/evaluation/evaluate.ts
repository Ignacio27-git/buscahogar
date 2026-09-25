// ROADMAP 2.2 — evaluateStrategy (decisión 091): compara UNA estrategia
// contra el corpus etiquetado, puntuando cada par UNA sola vez (BAND-4: el
// score es independiente del umbral) y bandeando ese mismo score en el
// umbral por defecto de la estrategia y en cada punto de la rejilla de
// sweep. La rejilla solo REBANDEA scores ya calculados: nunca vuelve a
// invocar `strategy.score`, que es el cálculo caro.
import type { DedupStrategy } from '../contracts/dedup-strategy.js';
import type { BandThresholds } from '../schemas/band-thresholds.schema.js';
import { classifyProbabilistic, FS_BAND_THRESHOLDS } from '../strategies/probabilistic/classify.js';
import { probabilisticDedupStrategy } from '../strategies/probabilistic/strategy.js';
import { classify, type SimilarityBand } from '../strategies/rule-based/classify.js';
import { RULE_BASED_BAND_THRESHOLDS } from '../strategies/rule-based/weights.js';
import { ruleBasedDedupStrategy } from '../strategies/rule-based/strategy.js';
import type { SimilarityResult } from '../types/similarity.js';
import type { CorpusEntry, GroundTruth } from './dedup-corpus.js';
import { computeMetrics, type BinaryMetrics, type LabeledBand } from './metrics.js';

export interface StrategyEvaluator {
  readonly strategy: DedupStrategy;
  readonly defaultThresholds: BandThresholds;
  readonly classify: (result: SimilarityResult, thresholds: BandThresholds) => SimilarityBand;
}

export interface PairEvaluation {
  readonly id: string;
  readonly truth: GroundTruth;
  readonly expected: SimilarityBand;
  readonly score: number;
  readonly band: SimilarityBand;
}

export interface SweepPoint {
  readonly thresholds: BandThresholds;
  readonly metrics: BinaryMetrics;
}

export interface StrategyEvaluation {
  readonly name: string;
  readonly version: string;
  readonly defaultThresholds: BandThresholds;
  readonly atDefault: BinaryMetrics;
  readonly pairs: readonly PairEvaluation[];
  readonly sweep: readonly SweepPoint[];
}

export const RULE_BASED_EVALUATOR: StrategyEvaluator = {
  strategy: ruleBasedDedupStrategy,
  defaultThresholds: RULE_BASED_BAND_THRESHOLDS,
  classify,
};

export const PROBABILISTIC_EVALUATOR: StrategyEvaluator = {
  strategy: probabilisticDedupStrategy,
  defaultThresholds: FS_BAND_THRESHOLDS,
  classify: classifyProbabilistic,
};

export const DEFAULT_EVALUATORS: readonly StrategyEvaluator[] = [RULE_BASED_EVALUATOR, PROBABILISTIC_EVALUATOR];

const SWEEP_HIGHS = [0.75, 0.82, 0.9, 0.95, 0.99] as const;
const SWEEP_LOWS = [0.3, 0.45, 0.5, 0.6] as const;

// Producto cartesiano completo (decisión 091): el low máximo (0.60) es menor
// que el high mínimo (0.75), así que las 20 combinaciones son válidas por
// construcción — ninguna necesita filtrarse. Incluye los dos puntos por
// defecto reales: {high:0.82,low:0.45} (rule-based) y {high:0.95,low:0.50}
// (FS), tal y como exige la spec "Default sweep covers both strategies'
// defaults".
export const DEFAULT_SWEEP: readonly BandThresholds[] = SWEEP_HIGHS.flatMap((high) =>
  SWEEP_LOWS.map((low) => ({ high, low }))
);

export function evaluateStrategy(
  corpus: readonly CorpusEntry[],
  evaluator: StrategyEvaluator,
  grid: readonly BandThresholds[]
): StrategyEvaluation {
  // Cada par se puntúa UNA sola vez aquí — `scored` es la única llamada a
  // `strategy.score` de toda la función, reutilizada tanto para `pairs`
  // (al umbral por defecto) como para cada tupla del sweep.
  const scored = corpus.map((entry) => ({ entry, result: evaluator.strategy.score(entry.a, entry.b) }));

  const pairs: PairEvaluation[] = scored.map(({ entry, result }) => ({
    id: entry.id,
    truth: entry.truth,
    expected: entry.expected,
    score: result.score,
    band: evaluator.classify(result, evaluator.defaultThresholds),
  }));

  const atDefault = computeMetrics(pairs.map((pair) => ({ id: pair.id, truth: pair.truth, band: pair.band })));

  const sweep: SweepPoint[] = grid.map((thresholds) => {
    const labeled: LabeledBand[] = scored.map(({ entry, result }) => ({
      id: entry.id,
      truth: entry.truth,
      band: evaluator.classify(result, thresholds),
    }));
    return { thresholds, metrics: computeMetrics(labeled) };
  });

  return {
    name: evaluator.strategy.name,
    version: evaluator.strategy.version,
    defaultThresholds: evaluator.defaultThresholds,
    atDefault,
    pairs,
    sweep,
  };
}

// Combinadores de imagen (ROADMAP 2.3, decisión 094): cómo un
// ImageComparison se traduce en un SignalScore `image` y, cuando es
// `strong`, cómo se recalcula `score`. Positivo-solo (C19): SOLO strong
// puede cambiar la puntuación; cualquier otro nivel deja `base.score`
// intacto y añade una entrada `image` a peso 0 — nunca resta.
//
// El peso RB (15) y los parámetros m/u de FS (0.30/0.05) se mantienen SIN
// exportar, mismo precedente que WEIGHTS/T_HIGH/T_LOW de rule-based y la
// tabla m/u de probabilistic/parameters.ts (barrel.test.ts).
import type { SignalScore, SimilarityResult } from '../../types/similarity.js';
import type { ImageComparison } from './compare.js';
import { formatImageDetail } from './detail.js';

export type ImageCombiner = (
  base: SimilarityResult,
  comparison: ImageComparison
) => SimilarityResult;

const RB_IMAGE_WEIGHT = 15;

// FS: m=0.30 (P(match fuerte | misma vivienda)), u=0.05 (P(match fuerte |
// par de bloqueo distinto)) — bits(nivel) = log2(m/u), mismo criterio que
// probabilistic/levels.ts:34-36, weight 1 cuando se evalúa.
const FS_IMAGE_M = 0.3;
const FS_IMAGE_U = 0.05;
const FS_IMAGE_BITS = Math.log2(FS_IMAGE_M / FS_IMAGE_U);

function neutralImageSignal(comparison: ImageComparison): SignalScore {
  return { value: 0, weight: 0, detail: formatImageDetail(comparison) };
}

function weightedMean(signals: Readonly<Record<string, SignalScore>>): number {
  const values = Object.values(signals);
  const totalWeight = values.reduce((sum, signal) => sum + signal.weight, 0);
  const weightedSum = values.reduce((sum, signal) => sum + signal.value * signal.weight, 0);
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

// Suma de `value` sobre las señales con weight > 0, en orden de inserción —
// reconstruye M exactamente porque en la estrategia FS TODA señal evaluada
// (prior incluido) tiene weight 1, y las dos claves de veto siempre tienen
// weight 0 (probabilistic/strategy.ts:41-47): filtrar por weight > 0 excluye
// exactamente lo mismo que excluye el cálculo manual de M original.
function posteriorLogOdds(signals: Readonly<Record<string, SignalScore>>): number {
  return Object.values(signals).reduce(
    (sum, signal) => (signal.weight > 0 ? sum + signal.value : sum),
    0
  );
}

export const ruleBasedImageCombiner: ImageCombiner = (base, comparison) => {
  if (comparison.level !== 'strong') {
    return {
      score: base.score,
      signals: { ...base.signals, image: neutralImageSignal(comparison) },
    };
  }

  const image: SignalScore = {
    value: 1,
    weight: RB_IMAGE_WEIGHT,
    detail: formatImageDetail(comparison),
  };
  const signals = { ...base.signals, image };

  return { score: weightedMean(signals), signals };
};

export const probabilisticImageCombiner: ImageCombiner = (base, comparison) => {
  if (comparison.level !== 'strong') {
    return {
      score: base.score,
      signals: { ...base.signals, image: neutralImageSignal(comparison) },
    };
  }

  const image: SignalScore = {
    value: FS_IMAGE_BITS,
    weight: 1,
    detail: formatImageDetail(comparison),
  };
  const signals = { ...base.signals, image };
  const M = posteriorLogOdds(signals);

  return { score: 1 / (1 + Math.pow(2, -M)), signals };
};

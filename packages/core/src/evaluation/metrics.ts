// ROADMAP 2.2 — métricas puras de evaluación (decisión 089): P/R/F1 y el
// intervalo de Wilson 95% sobre una lista de bandas etiquetadas. `truth`
// viene SIEMPRE de `LabeledBand` (nunca de `expected`, el campo `truth` de
// `CorpusEntry` es la ÚNICA fuente admitida) — este módulo ni siquiera
// conoce el tipo `ExpectedBand`, así que no hay ninguna vía de que se cuele
// por error (spec "Ground-Truth Labels").
import type { SimilarityBand } from '../strategies/rule-based/classify.js';
import type { GroundTruth } from './dedup-corpus.js';

export interface LabeledBand {
  readonly id: string;
  readonly truth: GroundTruth;
  readonly band: SimilarityBand;
}

// Las 3 bandas × 2 verdades dan exactamente 6 casillas mutuamente
// excluyentes: cada par etiquetado cae en UNA sola. `undecidedDuplicate`/
// `undecidedDistinct` son casillas propias, no un subconjunto ya contado en
// `falseNegative`/`trueNegative` — la suma de las 6 siempre da el total de
// pares evaluados.
export interface ConfusionCounts {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  undecidedDuplicate: number;
  undecidedDistinct: number;
}

export interface Interval {
  low: number;
  high: number;
}

export interface Proportion {
  value: number | null;
  successes: number;
  trials: number;
  wilson95: Interval | null;
}

export interface BinaryMetrics {
  counts: ConfusionCounts;
  precision: Proportion;
  recall: Proportion;
  f1: number | null;
  undecidedRate: Proportion;
}

// Percentil 97.5 de la normal estándar (95% de confianza), constante
// literaria estándar — no se calcula aquí, evita depender de una función
// inversa de la normal solo para un único valor fijo (C10, investigación).
const WILSON_Z = 1.959963984540054;

export function wilsonInterval(successes: number, trials: number): Interval | null {
  if (trials <= 0) {
    return null;
  }

  const z2 = WILSON_Z * WILSON_Z;
  const phat = successes / trials;
  const denominator = 1 + z2 / trials;
  const center = phat + z2 / (2 * trials);
  const adjustment = WILSON_Z * Math.sqrt((phat * (1 - phat)) / trials + z2 / (4 * trials * trials));

  return {
    low: (center - adjustment) / denominator,
    high: (center + adjustment) / denominator,
  };
}

function buildProportion(successes: number, trials: number): Proportion {
  return {
    value: trials > 0 ? successes / trials : null,
    successes,
    trials,
    wilson95: wilsonInterval(successes, trials),
  };
}

export function computeMetrics(bands: readonly LabeledBand[]): BinaryMetrics {
  const counts: ConfusionCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    undecidedDuplicate: 0,
    undecidedDistinct: 0,
  };

  for (const { truth, band } of bands) {
    if (band === 'accept') {
      counts.truePositive += truth === 'duplicate' ? 1 : 0;
      counts.falsePositive += truth === 'distinct' ? 1 : 0;
    } else if (band === 'reject') {
      counts.falseNegative += truth === 'duplicate' ? 1 : 0;
      counts.trueNegative += truth === 'distinct' ? 1 : 0;
    } else {
      counts.undecidedDuplicate += truth === 'duplicate' ? 1 : 0;
      counts.undecidedDistinct += truth === 'distinct' ? 1 : 0;
    }
  }

  const precision = buildProportion(counts.truePositive, counts.truePositive + counts.falsePositive);
  // D2/decisión 089: undecided cuenta como negativo — un duplicado real
  // clasificado `undecided` es un fallo de recall, exactamente igual que uno
  // rechazado, así que entra en el denominador de recall aunque no se
  // etiquete como `falseNegative` en `counts` (esa casilla queda reservada
  // para el `reject` explícito, ver ConfusionCounts arriba).
  const recall = buildProportion(
    counts.truePositive,
    counts.truePositive + counts.falseNegative + counts.undecidedDuplicate
  );
  const undecidedRate = buildProportion(counts.undecidedDuplicate + counts.undecidedDistinct, bands.length);

  const f1 =
    precision.value === null || recall.value === null
      ? null
      : precision.value + recall.value === 0
        ? 0
        : (2 * precision.value * recall.value) / (precision.value + recall.value);

  return { counts, precision, recall, f1, undecidedRate };
}

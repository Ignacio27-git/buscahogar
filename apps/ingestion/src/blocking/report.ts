// ROADMAP 1.8 — buildCalibrationReport (diseño D-C3, CLI-3): función pura,
// composición de los tipos ya expuestos por `packages/db` (`CorpusSummary`,
// `CandidatePairCounts`) en la forma JSON que sale por stdout. El bloque
// `corpus` se calcula UNA vez por invocación de la CLI, independiente de
// cualquier combinación de umbrales (CLI-3a): es lo que permite atribuir un
// conteo de cero a "sin geometría"/"ofuscado" en vez de a "umbrales
// demasiado estrictos" — el criterio de revisión propio de ROADMAP 1.8.
import type { BlockingThresholds } from '@buscahogar/core';
import type { CandidatePairCounts, CorpusSummary } from '@buscahogar/db';

export interface CalibrationCombinationInput {
  readonly thresholds: BlockingThresholds;
  readonly counts: CandidatePairCounts;
}

export interface CalibrationCombinationResult {
  readonly thresholds: BlockingThresholds;
  readonly candidatePairs: number;
  readonly pairsWithMissingSurface: number;
  readonly pairsByObfuscation: {
    readonly neither: number;
    readonly one: number;
    readonly both: number;
  };
}

export interface CalibrationReport {
  readonly corpus: CorpusSummary;
  readonly combinations: readonly CalibrationCombinationResult[];
}

export function buildCalibrationReport(
  corpus: CorpusSummary,
  combinations: readonly CalibrationCombinationInput[]
): CalibrationReport {
  return {
    corpus,
    combinations: combinations.map(({ thresholds, counts }) => ({
      thresholds,
      candidatePairs: counts.total,
      pairsWithMissingSurface: counts.withMissingSurface,
      pairsByObfuscation: {
        neither: counts.neitherObfuscated,
        one: counts.oneObfuscated,
        both: counts.bothObfuscated,
      },
    })),
  };
}

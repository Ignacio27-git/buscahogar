// ROADMAP 2.2 — buildComparisonReport (decisión 091): función pura que
// compone la forma común que render.ts convierte a Markdown/JSON/CSV. El
// bloque de caveat/limitations es constante — no depende de ninguna
// combinación de umbrales ni de qué estrategias se hayan evaluado (mismo
// criterio que buildCalibrationReport, CLI-3a, paso 1.8): el tamaño del
// corpus y sus limitaciones son propiedades del corpus, no de la ejecución.
//
// ROADMAP 2.3 (Phase 4, decisión 099) — bandChanges: para cada fila con
// señal de imagen (`strategy.image !== undefined`), se busca su baseline
// estructurada-solo por NOMBRE (`withImageSignal` produce siempre
// `${base.name}+image-phash`, with-image-signal.ts) — no por posición en el
// array `strategies`, así que el orden en que el llamador pase las
// estrategias es irrelevante para este cálculo. Cualquier pareja cuya banda
// cambie entre baseline e imagen se reporta con su causa (distance/reason de
// su `ImageComparison`) — spec "New False Positives on Hard Negatives Must
// Be Reported with Cause" exige esto para `hn-*`; aquí se calcula para
// CUALQUIER pareja, lo que cubre ese caso como subconjunto sin necesitar un
// filtro `hn-*` aparte.
import type { BandThresholds, GroundTruth, ImageReason, SimilarityBand, StrategyEvaluation } from '@buscahogar/core';
import { dedupCorpus } from '@buscahogar/core';

import type { BandGrid } from './grid.js';

// Texto constante en español (obs #284: prosa/caveat en español, siguiendo
// la convención del proyecto para docs y para la memoria; identificadores y
// columnas en inglés). Contiene una coma real a propósito — el propio
// campo obliga a que renderCsv() lo cite correctamente por RFC 4180.
export const CORPUS_CAVEAT =
  '24 pares construidos a mano; prueba mecánica, no calibración (parámetros fijados a priori).';

// ROADMAP 2.3 — spec "Small-Sample Caveat" (modificado): toda fila que
// incluya la señal de imagen debe declarar que esa evidencia es SIMULADA
// (transformaciones controladas de fotos CC0, nunca miniaturas reales de
// portal — D5/decisión 096). Texto IDÉNTICO en los tres formatos (spec
// "Simulated-image caveat present on image rows").
export const IMAGE_EVIDENCE_CAVEAT =
  'evidencia de imagen simulada: transformaciones controladas de fotos CC0, no miniaturas reales de portales.';

export const REPORT_LIMITATIONS: readonly string[] = [
  'Muestra pequeña (n=24): ningún resultado aquí sustituye una evaluación estadística sobre un corpus mayor.',
  'Los parámetros de ambas estrategias están fijados a priori (decisión 085/D3), nunca ajustados sobre este mismo corpus.',
  'Precio/superficie y distancia/dirección están correlacionados en la práctica (C8, investigación); ambas estrategias tratan cada campo como independiente.',
  'La estrategia probabilística no tiene piso de evidencia explícito: el argumento de que dos campos opcionales no bastan para aceptar (decisión 087) solo vale en sus umbrales por defecto, no en cualquier punto de la rejilla.',
  'Las dos estrategias devuelven escalas de score distintas (rule-based normaliza por peso efectivo; la probabilística es una probabilidad 2^M/(1+2^M)): comparar el score crudo entre estrategias no tiene sentido, solo sus bandas y métricas.',
];

export interface BandChange {
  readonly strategy: string;
  readonly id: string;
  readonly truth: GroundTruth;
  readonly from: SimilarityBand;
  readonly to: SimilarityBand;
  readonly distance: number | null;
  readonly reason: ImageReason;
}

export interface ComparisonReport {
  corpusSize: number;
  caveat: string;
  imageCaveat: string;
  gridSource: 'default' | 'flags';
  grid: readonly BandThresholds[];
  strategies: readonly StrategyEvaluation[];
  limitations: readonly string[];
  bandChanges: readonly BandChange[];
}

const IMAGE_STRATEGY_SUFFIX = '+image-phash';

function baselineNameFor(imageStrategyName: string): string | undefined {
  return imageStrategyName.endsWith(IMAGE_STRATEGY_SUFFIX)
    ? imageStrategyName.slice(0, -IMAGE_STRATEGY_SUFFIX.length)
    : undefined;
}

function computeBandChanges(strategies: readonly StrategyEvaluation[]): readonly BandChange[] {
  const changes: BandChange[] = [];

  for (const imageRow of strategies) {
    if (imageRow.image === undefined) continue;

    const baselineName = baselineNameFor(imageRow.name);
    const baseline = strategies.find((candidate) => candidate.name === baselineName);
    if (baseline === undefined) continue;

    for (const pair of imageRow.pairs) {
      if (pair.image === undefined) continue;
      const basePair = baseline.pairs.find((candidate) => candidate.id === pair.id);
      if (basePair === undefined || basePair.band === pair.band) continue;

      changes.push({
        strategy: imageRow.name,
        id: pair.id,
        truth: pair.truth,
        from: basePair.band,
        to: pair.band,
        distance: pair.image.distance,
        reason: pair.image.reason,
      });
    }
  }

  return changes;
}

export function buildComparisonReport(grid: BandGrid, strategies: readonly StrategyEvaluation[]): ComparisonReport {
  return {
    corpusSize: dedupCorpus.length,
    caveat: CORPUS_CAVEAT,
    imageCaveat: IMAGE_EVIDENCE_CAVEAT,
    gridSource: grid.source,
    grid: grid.thresholds,
    strategies,
    limitations: REPORT_LIMITATIONS,
    bandChanges: computeBandChanges(strategies),
  };
}

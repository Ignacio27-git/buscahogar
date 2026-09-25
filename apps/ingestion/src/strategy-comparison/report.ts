// ROADMAP 2.2 — buildComparisonReport (decisión 091): función pura que
// compone la forma común que render.ts convierte a Markdown/JSON/CSV. El
// bloque de caveat/limitations es constante — no depende de ninguna
// combinación de umbrales ni de qué estrategias se hayan evaluado (mismo
// criterio que buildCalibrationReport, CLI-3a, paso 1.8): el tamaño del
// corpus y sus limitaciones son propiedades del corpus, no de la ejecución.
import type { BandThresholds, StrategyEvaluation } from '@buscahogar/core';
import { dedupCorpus } from '@buscahogar/core';

import type { BandGrid } from './grid.js';

// Texto constante en español (obs #284: prosa/caveat en español, siguiendo
// la convención del proyecto para docs y para la memoria; identificadores y
// columnas en inglés). Contiene una coma real a propósito — el propio
// campo obliga a que renderCsv() lo cite correctamente por RFC 4180.
export const CORPUS_CAVEAT =
  '24 pares construidos a mano; prueba mecánica, no calibración (parámetros fijados a priori).';

export const REPORT_LIMITATIONS: readonly string[] = [
  'Muestra pequeña (n=24): ningún resultado aquí sustituye una evaluación estadística sobre un corpus mayor.',
  'Los parámetros de ambas estrategias están fijados a priori (decisión 085/D3), nunca ajustados sobre este mismo corpus.',
  'Precio/superficie y distancia/dirección están correlacionados en la práctica (C8, investigación); ambas estrategias tratan cada campo como independiente.',
  'La estrategia probabilística no tiene piso de evidencia explícito: el argumento de que dos campos opcionales no bastan para aceptar (decisión 087) solo vale en sus umbrales por defecto, no en cualquier punto de la rejilla.',
  'Las dos estrategias devuelven escalas de score distintas (rule-based normaliza por peso efectivo; la probabilística es una probabilidad 2^M/(1+2^M)): comparar el score crudo entre estrategias no tiene sentido, solo sus bandas y métricas.',
];

export interface ComparisonReport {
  corpusSize: number;
  caveat: string;
  gridSource: 'default' | 'flags';
  grid: readonly BandThresholds[];
  strategies: readonly StrategyEvaluation[];
  limitations: readonly string[];
}

export function buildComparisonReport(grid: BandGrid, strategies: readonly StrategyEvaluation[]): ComparisonReport {
  return {
    corpusSize: dedupCorpus.length,
    caveat: CORPUS_CAVEAT,
    gridSource: grid.source,
    grid: grid.thresholds,
    strategies,
    limitations: REPORT_LIMITATIONS,
  };
}

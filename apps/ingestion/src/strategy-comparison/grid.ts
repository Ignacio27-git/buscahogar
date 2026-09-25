// ROADMAP 2.2 — expandBandGrid (decisión 091): rejilla de umbrales de la
// CLI de comparación de estrategias. Mismo criterio de "rechaza, no trunca"
// que blocking/grid.ts (paso 1.8, read-only): un tope excedido RECHAZA en
// vez de truncar en silencio. A diferencia de blocking/grid.ts, aquí TODA
// tupla se valida ANTES de devolver nada — una sola inválida (low >= high)
// rechaza el conjunto ENTERO, nunca se filtra ni produce salida parcial
// (spec "Invalid tuple rejects the whole sweep").
//
// Bucle plano (`for`), no vetado: el ban de bucles de eslint.config.mjs
// solo cubre las superficies que emiten peticiones HTTP — este módulo no
// hace ninguna.
import { bandThresholdsSchema, DEFAULT_SWEEP } from '@buscahogar/core';
import type { BandThresholds } from '@buscahogar/core';

import type { ComparisonRawOptions } from './options.js';

export const MAX_COMBINATIONS = 64;

export class GridSizeError extends Error {}
export class GridValidationError extends Error {}

export interface BandGrid {
  readonly thresholds: readonly BandThresholds[];
  readonly source: 'default' | 'flags';
}

function sortKey(thresholds: BandThresholds): string {
  return `${thresholds.high.toFixed(6)}|${thresholds.low.toFixed(6)}`;
}

export function expandBandGrid(options: ComparisonRawOptions): BandGrid {
  if (options.high === undefined || options.low === undefined) {
    // DEFAULT_SWEEP ya viene deduplicado y ordenado por construcción
    // (packages/core/src/evaluation/evaluate.ts, decisión 091) — se
    // devuelve tal cual, sin reconstruirlo.
    return { thresholds: DEFAULT_SWEEP, source: 'default' };
  }

  const total = options.high.length * options.low.length;
  if (total > MAX_COMBINATIONS) {
    throw new GridSizeError(
      `La rejilla solicitada tiene ${String(total)} combinaciones, por encima del tope de ` +
        `${String(MAX_COMBINATIONS)}. Reduce la cantidad de valores por flag y vuelve a ejecutar.`
    );
  }

  const combinations: BandThresholds[] = [];
  for (const high of options.high) {
    for (const low of options.low) {
      combinations.push({ high, low });
    }
  }

  // Validación completa ANTES de deduplicar/ordenar: la primera tupla
  // inválida en orden de generación rechaza el conjunto ENTERO.
  const invalid = combinations.find((tuple) => !bandThresholdsSchema.safeParse(tuple).success);
  if (invalid !== undefined) {
    throw new GridValidationError(
      `Tupla de umbrales inválida: high=${invalid.high.toString()},low=${invalid.low.toString()} ` +
        '(low debe ser < high, y ambos estar en [0,1]).'
    );
  }

  const deduped = new Map<string, BandThresholds>();
  for (const tuple of combinations) {
    deduped.set(sortKey(tuple), tuple);
  }

  const sorted = [...deduped.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return { thresholds: sorted, source: 'flags' };
}

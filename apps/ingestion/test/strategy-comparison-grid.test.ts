// ROADMAP 2.2 — expandBandGrid (decisión 091): rejilla de umbrales de la
// CLI de comparación de estrategias. Mismo criterio de "rechaza, no trunca"
// que blocking/grid.ts (paso 1.8): un tope excedido O una tupla inválida
// (low >= high) rechaza el conjunto ENTERO, nunca filtra en silencio (spec
// "Invalid tuple rejects the whole sweep").
import { describe, expect, it } from 'vitest';

import { DEFAULT_SWEEP } from '@buscahogar/core';

import { expandBandGrid, GridSizeError, GridValidationError, MAX_COMBINATIONS } from '../src/strategy-comparison/grid.js';
import type { ComparisonRawOptions } from '../src/strategy-comparison/options.js';

function options(overrides: Partial<ComparisonRawOptions> = {}): ComparisonRawOptions {
  return { format: 'json', output: undefined, high: undefined, low: undefined, ...overrides };
}

describe('expandBandGrid — rejilla de umbrales (decisión 091)', () => {
  it('sin --high/--low, usa DEFAULT_SWEEP de @buscahogar/core (mismo array, sin reconstruirlo) y source=default', () => {
    const grid = expandBandGrid(options());
    expect(grid.source).toBe('default');
    expect(grid.thresholds).toBe(DEFAULT_SWEEP);
  });

  it('con --high/--low, produce el producto cartesiano deduplicado y ordenado, source=flags', () => {
    const grid = expandBandGrid(options({ high: [0.9, 0.8], low: [0.3] }));
    expect(grid.source).toBe('flags');
    expect(grid.thresholds).toEqual([
      { high: 0.8, low: 0.3 },
      { high: 0.9, low: 0.3 },
    ]);
  });

  it('tuplas duplicadas colapsan a una sola', () => {
    const grid = expandBandGrid(options({ high: [0.9, 0.9], low: [0.3] }));
    expect(grid.thresholds).toEqual([{ high: 0.9, low: 0.3 }]);
  });

  it('una rejilla por encima de MAX_COMBINATIONS rechaza nombrando el conteo calculado', () => {
    const high = Array.from({ length: 9 }, (_, i) => 0.5 + i * 0.01);
    const low = Array.from({ length: 9 }, (_, i) => 0.1 + i * 0.001);
    expect(() => expandBandGrid(options({ high, low }))).toThrow(GridSizeError);
    expect(() => expandBandGrid(options({ high, low }))).toThrow(/81/);
  });

  it('una tupla inválida (low >= high) rechaza el conjunto ENTERO, nombrando la tupla ofensiva', () => {
    expect(() => expandBandGrid(options({ high: [0.9, 0.5], low: [0.3, 0.6] }))).toThrow(GridValidationError);
    expect(() => expandBandGrid(options({ high: [0.9, 0.5], low: [0.3, 0.6] }))).toThrow(/0\.5/);
  });

  it('un umbral fuera de rango (high>1) también rechaza el conjunto entero, vía bandThresholdsSchema', () => {
    expect(() => expandBandGrid(options({ high: [1.5], low: [0.3] }))).toThrow(GridValidationError);
  });

  it('MAX_COMBINATIONS es 64', () => {
    expect(MAX_COMBINATIONS).toBe(64);
  });
});

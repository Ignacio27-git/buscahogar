// ROADMAP 2.2 — determinismo de renderMarkdown/renderJson/renderCsv (spec
// "Repeated runs match"): misma entrada → mismos bytes en cada formato,
// sin reloj ni configuración regional. Este fichero también fija el
// comportamiento de null: "n/a" en Markdown, campo vacío en CSV.
import { describe, expect, it } from 'vitest';

import type { BinaryMetrics, StrategyEvaluation } from '@buscahogar/core';

import { buildComparisonReport } from '../src/strategy-comparison/report.js';
import { renderCsv, renderJson, renderMarkdown } from '../src/strategy-comparison/render.js';
import type { BandGrid } from '../src/strategy-comparison/grid.js';

const METRICS_WITH_NULLS: BinaryMetrics = {
  counts: { truePositive: 0, falsePositive: 0, falseNegative: 1, trueNegative: 0, undecidedDuplicate: 0, undecidedDistinct: 0 },
  precision: { value: null, successes: 0, trials: 0, wilson95: null },
  recall: { value: 0, successes: 0, trials: 1, wilson95: { low: 0, high: 0.79 } },
  f1: null,
  undecidedRate: { value: 0, successes: 0, trials: 1, wilson95: { low: 0, high: 0.79 } },
};

const STRATEGY_WITH_NULLS: StrategyEvaluation = {
  name: 'edge-case-strategy',
  version: '1.0.0',
  defaultThresholds: { high: 0.9, low: 0.1 },
  atDefault: METRICS_WITH_NULLS,
  pairs: [],
  sweep: [],
};

const GRID: BandGrid = { thresholds: [], source: 'default' };

describe('renderMarkdown/renderJson/renderCsv son deterministas (spec "Repeated runs match")', () => {
  const report = buildComparisonReport(GRID, [STRATEGY_WITH_NULLS]);

  it('renderMarkdown es byte-idéntico en dos ejecuciones sobre el mismo report', () => {
    expect(renderMarkdown(report)).toBe(renderMarkdown(report));
  });

  it('renderJson es byte-idéntico en dos ejecuciones sobre el mismo report', () => {
    expect(renderJson(report)).toBe(renderJson(report));
  });

  it('renderCsv es byte-idéntico en dos ejecuciones sobre el mismo report', () => {
    expect(renderCsv(report)).toBe(renderCsv(report));
  });
});

describe('null se renderiza como "n/a" en Markdown y como campo vacío en CSV (spec render null handling)', () => {
  const report = buildComparisonReport(GRID, [STRATEGY_WITH_NULLS]);

  it('Markdown: precision (null) aparece como "n/a", nunca como "null" ni "NaN"', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('| Precisión | n/a |');
    expect(md).not.toContain('NaN');
    expect(md).not.toMatch(/\bnull\b/);
  });

  it('CSV: precision y f1 (ambos null) aparecen como campo vacío entre comas', () => {
    const csv = renderCsv(report);
    const lines = csv.split('\r\n');
    const header = (lines[0] ?? '').split(',');
    const dataLine = (lines[1] ?? '').split(',');

    expect(dataLine[header.indexOf('precision')]).toBe('');
    expect(dataLine[header.indexOf('f1')]).toBe('');
    // recall SÍ tiene valor (0), así que su campo no debe quedar vacío.
    expect(dataLine[header.indexOf('recall')]).toBe('0.0000');
  });
});

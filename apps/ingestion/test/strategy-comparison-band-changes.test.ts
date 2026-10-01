// bandChanges (ROADMAP 2.3, spec "New False Positives on Hard Negatives Must
// Be Reported with Cause" / design decisión 099): diff entre cada fila con
// señal de imagen y su baseline estructurada-solo (misma familia de
// estrategia, emparejadas por nombre: `${baseline.name}+image-phash` ===
// imageRow.name) — todo par cuya banda cambia se reporta con causa
// (distance/reason de su ImageComparison), no solo los `hn-*`.
import { describe, expect, it } from 'vitest';

import type { BinaryMetrics, StrategyEvaluation } from '@buscahogar/core';

import { buildComparisonReport } from '../src/strategy-comparison/report.js';
import type { BandGrid } from '../src/strategy-comparison/grid.js';

const GRID: BandGrid = { thresholds: [], source: 'default' };

function metrics(): BinaryMetrics {
  return {
    counts: { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0, undecidedDuplicate: 0, undecidedDistinct: 0 },
    precision: { value: null, successes: 0, trials: 0, wilson95: null },
    recall: { value: null, successes: 0, trials: 0, wilson95: null },
    f1: null,
    undecidedRate: { value: null, successes: 0, trials: 0, wilson95: null },
  };
}

describe('bandChanges — un hn-* que pasa de reject/undecided estructurado-solo a accept con imagen se reporta con causa', () => {
  const baseline: StrategyEvaluation = {
    name: 'rule-based-structured',
    version: '1.0.0',
    defaultThresholds: { high: 0.82, low: 0.45 },
    atDefault: metrics(),
    pairs: [
      { id: 'hn-1-trafalgar-street-less-rooms-distintos', truth: 'distinct', expected: 'undecided', score: 0.6, band: 'undecided' },
    ],
    sweep: [],
  };

  const withImage: StrategyEvaluation = {
    name: 'rule-based-structured+image-phash',
    version: '1.0.0+phash-t10',
    defaultThresholds: { high: 0.82, low: 0.45 },
    atDefault: metrics(),
    pairs: [
      {
        id: 'hn-1-trafalgar-street-less-rooms-distintos',
        truth: 'distinct',
        expected: 'undecided',
        score: 0.9,
        band: 'accept',
        image: { level: 'strong', reason: 'match', distance: 4, threshold: 10 },
      },
    ],
    sweep: [],
    image: { threshold: 10 },
  };

  it('bandChanges contiene exactamente esa entrada, con id/truth/from/to/distance/reason', () => {
    const report = buildComparisonReport(GRID, [baseline, withImage]);

    expect(report.bandChanges).toHaveLength(1);
    expect(report.bandChanges[0]).toEqual({
      strategy: 'rule-based-structured+image-phash',
      id: 'hn-1-trafalgar-street-less-rooms-distintos',
      truth: 'distinct',
      from: 'undecided',
      to: 'accept',
      distance: 4,
      reason: 'match',
    });
  });
});

describe('bandChanges — sin cambios produce un array vacío', () => {
  it('la misma banda en baseline y en la fila con imagen no genera ninguna entrada', () => {
    const baseline: StrategyEvaluation = {
      name: 'rule-based-structured',
      version: '1.0.0',
      defaultThresholds: { high: 0.82, low: 0.45 },
      atDefault: metrics(),
      pairs: [{ id: 'tp-1-mismo-anuncio-cerca', truth: 'duplicate', expected: 'accept', score: 0.95, band: 'accept' }],
      sweep: [],
    };
    const withImage: StrategyEvaluation = {
      name: 'rule-based-structured+image-phash',
      version: '1.0.0+phash-t10',
      defaultThresholds: { high: 0.82, low: 0.45 },
      atDefault: metrics(),
      pairs: [
        {
          id: 'tp-1-mismo-anuncio-cerca',
          truth: 'duplicate',
          expected: 'accept',
          score: 0.97,
          band: 'accept',
          image: { level: 'strong', reason: 'match', distance: 0, threshold: 10 },
        },
      ],
      sweep: [],
      image: { threshold: 10 },
    };

    const report = buildComparisonReport(GRID, [baseline, withImage]);

    expect(report.bandChanges).toEqual([]);
  });
});

describe('bandChanges — solo las filas con imagen se diffean; una fila estructurada-solo aislada no produce nada', () => {
  it('sin ninguna fila con imagen en el report, bandChanges es siempre vacío', () => {
    const baseline: StrategyEvaluation = {
      name: 'rule-based-structured',
      version: '1.0.0',
      defaultThresholds: { high: 0.82, low: 0.45 },
      atDefault: metrics(),
      pairs: [{ id: 'tp-1-mismo-anuncio-cerca', truth: 'duplicate', expected: 'accept', score: 0.95, band: 'accept' }],
      sweep: [],
    };

    const report = buildComparisonReport(GRID, [baseline]);

    expect(report.bandChanges).toEqual([]);
  });
});

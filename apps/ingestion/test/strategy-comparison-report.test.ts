// ROADMAP 2.2 — buildComparisonReport + renderMarkdown/Json/Csv (decisión
// 091): el caveat de muestra pequeña y el tamaño del corpus deben ser
// visibles en LOS TRES formatos (spec "Small-Sample Caveat" / "Caveat
// present in every format"), y las tres representaciones deben describir
// las mismas métricas (spec "Formats agree"). Este fichero ejercita tanto
// report.ts (construcción) como render.ts (las tres salidas) — el mismo
// patrón de un RED que solo llega a GREEN tras dos piezas de producción,
// igual que probabilistic-strategy.test.ts en el batch anterior.
import { describe, expect, it } from 'vitest';

import type { BinaryMetrics, StrategyEvaluation } from '@buscahogar/core';

import { buildComparisonReport, CORPUS_CAVEAT } from '../src/strategy-comparison/report.js';
import { CSV_COLUMNS, renderCsv, renderJson, renderMarkdown } from '../src/strategy-comparison/render.js';
import type { BandGrid } from '../src/strategy-comparison/grid.js';

// Parser RFC 4180 mínimo, usado SOLO en el test: sirve para comprobar que
// nuestro propio escritor produce CSV realmente parseable (round-trip),
// incluidas las comillas dobles del propio caveat (que contiene una coma).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 2;
      continue;
    }
    field += char;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const SAMPLE_METRICS: BinaryMetrics = {
  counts: { truePositive: 2, falsePositive: 1, falseNegative: 0, trueNegative: 3, undecidedDuplicate: 1, undecidedDistinct: 0 },
  precision: { value: 2 / 3, successes: 2, trials: 3, wilson95: { low: 0.2, high: 0.9 } },
  recall: { value: 2 / 3, successes: 2, trials: 3, wilson95: { low: 0.2, high: 0.9 } },
  f1: 2 / 3,
  undecidedRate: { value: 1 / 7, successes: 1, trials: 7, wilson95: null },
};

const SAMPLE_SWEEP_POINT = { thresholds: { high: 0.9, low: 0.3 }, metrics: SAMPLE_METRICS };

const SAMPLE_STRATEGY: StrategyEvaluation = {
  name: 'sample-strategy',
  version: '9.9.9',
  defaultThresholds: { high: 0.8, low: 0.4 },
  atDefault: SAMPLE_METRICS,
  pairs: [],
  sweep: [SAMPLE_SWEEP_POINT],
};

const SAMPLE_GRID: BandGrid = { thresholds: [SAMPLE_SWEEP_POINT.thresholds], source: 'flags' };

describe('buildComparisonReport — caveat/limitations constantes, independientes de la rejilla o las estrategias (CLI-3a)', () => {
  it('corpusSize y caveat no dependen de la rejilla ni de qué estrategias se hayan evaluado', () => {
    const report = buildComparisonReport({ thresholds: [], source: 'default' }, []);

    expect(report.corpusSize).toBe(24);
    expect(report.caveat).toBe(CORPUS_CAVEAT);
    expect(report.limitations.length).toBeGreaterThan(0);
  });
});

describe('caveat presente en los tres formatos (spec "Caveat present in every format")', () => {
  const report = buildComparisonReport(SAMPLE_GRID, [SAMPLE_STRATEGY]);

  it('Markdown: prosa con el tamaño de corpus y el texto del caveat', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('24 pares evaluados');
    expect(md).toContain(CORPUS_CAVEAT);
  });

  it('JSON: corpusSize y caveat en la raíz', () => {
    const parsed = JSON.parse(renderJson(report)) as { corpusSize: number; caveat: string };
    expect(parsed.corpusSize).toBe(24);
    expect(parsed.caveat).toBe(CORPUS_CAVEAT);
  });

  it('CSV: corpus_size y caveat en TODAS las filas de datos, como columnas constantes, y el CSV es RFC 4180 válido', () => {
    const csv = renderCsv(report);
    const rows = parseCsv(csv);
    const header = rows[0];
    expect(header).toBeDefined();
    if (header === undefined) return;

    expect(header).toEqual([...CSV_COLUMNS]);
    // Toda fila (incluida la cabecera) tiene el MISMO número de columnas —
    // ninguna línea de comentario ni estructura no tabular (spec "CSV
    // caveat does not break RFC 4180").
    for (const row of rows) {
      expect(row).toHaveLength(CSV_COLUMNS.length);
    }

    const corpusSizeIndex = header.indexOf('corpus_size');
    const caveatIndex = header.indexOf('caveat');
    for (const row of rows.slice(1)) {
      expect(row[corpusSizeIndex]).toBe('24');
      // El caveat contiene una coma real ("prueba mecánica, no
      // calibración"): si el parser RFC 4180 la reconstruye entera, la
      // función de escritura la citó correctamente.
      expect(row[caveatIndex]).toBe(CORPUS_CAVEAT);
    }
  });
});

describe('formats agree — las tres representaciones describen las mismas métricas del mismo report (spec "Formats agree")', () => {
  it('la precisión de la fila is_default=true del CSV coincide, redondeada a 4 decimales, con atDefault.precision del JSON', () => {
    const report = buildComparisonReport(SAMPLE_GRID, [SAMPLE_STRATEGY]);

    const parsed = JSON.parse(renderJson(report)) as {
      strategies: readonly { atDefault: { precision: { value: number } } }[];
    };
    const firstStrategy = parsed.strategies[0];
    expect(firstStrategy).toBeDefined();
    if (firstStrategy === undefined) return;
    const jsonPrecision = firstStrategy.atDefault.precision.value.toFixed(4);

    const rows = parseCsv(renderCsv(report));
    const header = rows[0];
    expect(header).toBeDefined();
    if (header === undefined) return;
    const defaultRow = rows.slice(1).find((row) => row[header.indexOf('is_default')] === 'true');

    expect(defaultRow).toBeDefined();
    expect(defaultRow?.[header.indexOf('precision')]).toBe(jsonPrecision);
    // 2/3 ≈ 0.6667 — prueba el valor REAL, no solo que el campo exista.
    expect(jsonPrecision).toBe('0.6667');
  });
});

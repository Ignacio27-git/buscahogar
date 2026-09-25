// ROADMAP 2.2 — corrección post-verify (verify-report WARNING-1, spec
// dedup-strategy-evaluation, requisito "Confusion Metrics with Separate
// Undecided Rate", escenario "Undecided counts as negative", D2/decisión
// 089): el FN/TN EXPUESTO en cada formato debe reconciliar con el
// precision/recall visibles en la misma fila — antes de esta corrección,
// false_negative/false_positive en CSV/JSON y "FN="/"TN=" en Markdown solo
// mostraban el rechazo explícito (`reject`), excluyendo los pares
// `undecided` que SÍ cuentan como negativo en el cálculo real de recall
// (packages/core/src/evaluation/metrics.ts). Este fichero ejercita
// runComparison() sobre el corpus REAL (24 pares, no un fixture sintético)
// para las dos estrategias en su fila `is_default`, con los valores
// confirmados por una ejecución real de la CLI antes de escribir estas
// aserciones (ver apply-progress de esta corrección).
import { describe, expect, it } from 'vitest';

import { runComparison } from '../scripts/compare-dedup-strategies.js';
import type { CliIo } from '../scripts/compare-dedup-strategies.js';

const CORPUS_SIZE = 24;

function fakeIo(): { io: CliIo; logs: string[] } {
  const logs: string[] = [];
  const io: CliIo = {
    log: (line: string) => logs.push(line),
    writeFile: () => {
      throw new Error('runComparison no debería escribir a fichero sin --output');
    },
  };
  return { io, logs };
}

// Parser RFC 4180 mínimo, igual al de strategy-comparison-report.test.ts —
// duplicado intencionalmente (cada fichero de test es autocontenido, mismo
// criterio que el resto de la suite de este módulo).
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

interface ExpectedRow {
  readonly strategy: string;
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegativeInclUndecided: number;
  readonly trueNegativeInclUndecided: number;
  readonly undecidedDuplicate: number;
  readonly undecidedDistinct: number;
  readonly precision: number;
  readonly recall: number;
}

// Valores confirmados por una ejecución real de la CLI (pre-corrección)
// sobre el corpus de 24 pares, antes de escribir estas aserciones:
// rule-based-structured: TP=8 FP=1 FN=0 TN=7 undecided_dup=2
// undecided_dist=6 → FN total (D2)=0+2=2, TN total=7+6=13.
// probabilistic-fellegi-sunter: TP=4 FP=1 FN=0 TN=12 undecided_dup=6
// undecided_dist=1 → FN total=0+6=6, TN total=12+1=13.
const EXPECTED_ROWS: readonly ExpectedRow[] = [
  {
    strategy: 'rule-based-structured',
    truePositive: 8,
    falsePositive: 1,
    falseNegativeInclUndecided: 2,
    trueNegativeInclUndecided: 13,
    undecidedDuplicate: 2,
    undecidedDistinct: 6,
    precision: 0.8889,
    recall: 0.8,
  },
  {
    strategy: 'probabilistic-fellegi-sunter',
    truePositive: 4,
    falsePositive: 1,
    falseNegativeInclUndecided: 6,
    trueNegativeInclUndecided: 13,
    undecidedDuplicate: 6,
    undecidedDistinct: 1,
    precision: 0.8,
    recall: 0.4,
  },
];

describe('reconciliación FN/TN expuesto vs recall/precisión visibles (corrección WARNING-1, D2/decisión 089)', () => {
  it('JSON: fila atDefault de cada estrategia — TP+FP+FN+TN=24 y recall/precisión visibles coinciden con las cifras expuestas', () => {
    const { io, logs } = fakeIo();
    const exitCode = runComparison(['--format', 'json'], io);
    expect(exitCode).toBe(0);
    expect(logs).toHaveLength(1);

    const parsed = JSON.parse(logs[0] ?? '') as {
      strategies: readonly {
        name: string;
        atDefault: {
          counts: {
            truePositive: number;
            falsePositive: number;
            falseNegativeInclUndecided: number;
            trueNegativeInclUndecided: number;
            undecidedDuplicate: number;
            undecidedDistinct: number;
          };
          precision: { value: number };
          recall: { value: number };
        };
      }[];
    };

    expect(parsed.strategies).toHaveLength(2);

    for (const expected of EXPECTED_ROWS) {
      const strategy = parsed.strategies.find((entry) => entry.name === expected.strategy);
      expect(strategy).toBeDefined();
      if (strategy === undefined) continue;

      const { counts, precision, recall } = strategy.atDefault;
      expect(counts.truePositive).toBe(expected.truePositive);
      expect(counts.falsePositive).toBe(expected.falsePositive);
      expect(counts.falseNegativeInclUndecided).toBe(expected.falseNegativeInclUndecided);
      expect(counts.trueNegativeInclUndecided).toBe(expected.trueNegativeInclUndecided);
      expect(counts.undecidedDuplicate).toBe(expected.undecidedDuplicate);
      expect(counts.undecidedDistinct).toBe(expected.undecidedDistinct);

      // Invariante visible: los 4 cuadrantes expuestos suman el tamaño del corpus.
      expect(counts.truePositive + counts.falsePositive + counts.falseNegativeInclUndecided + counts.trueNegativeInclUndecided).toBe(
        CORPUS_SIZE
      );
      // Invariante visible: recall/precisión se reconstruyen a partir de las
      // cifras expuestas (no de counts.falseNegative/trueNegative "crudos",
      // que ya no son parte del artefacto exportado).
      expect(counts.truePositive / (counts.truePositive + counts.falseNegativeInclUndecided)).toBeCloseTo(recall.value, 10);
      expect(counts.truePositive / (counts.truePositive + counts.falsePositive)).toBeCloseTo(precision.value, 10);
      // Los valores de precisión/recall en sí NO cambian por esta corrección.
      expect(precision.value).toBeCloseTo(expected.precision, 4);
      expect(recall.value).toBeCloseTo(expected.recall, 4);
    }
  });

  it('CSV: fila is_default=true de cada estrategia — mismas cifras reconciliadas, mismo invariante, cabecera sin ambigüedad', () => {
    const { io, logs } = fakeIo();
    const exitCode = runComparison(['--format', 'csv'], io);
    expect(exitCode).toBe(0);

    const rows = parseCsv(logs[0] ?? '');
    const header = rows[0];
    expect(header).toBeDefined();
    if (header === undefined) return;

    // El nombre de columna deja claro que ya no es el "reject" crudo.
    expect(header).toContain('false_negative_incl_undecided');
    expect(header).toContain('true_negative_incl_undecided');
    expect(header).not.toContain('false_negative');
    expect(header).not.toContain('true_negative');
    // Las columnas de desglose "de las cuales indecisas" se conservan.
    expect(header).toContain('undecided_duplicate');
    expect(header).toContain('undecided_distinct');

    const idx = (column: string): number => header.indexOf(column);

    for (const expected of EXPECTED_ROWS) {
      const row = rows
        .slice(1)
        .find((candidate) => candidate[idx('strategy')] === expected.strategy && candidate[idx('is_default')] === 'true');
      expect(row).toBeDefined();
      if (row === undefined) continue;

      const truePositive = Number(row[idx('true_positive')]);
      const falsePositive = Number(row[idx('false_positive')]);
      const falseNegative = Number(row[idx('false_negative_incl_undecided')]);
      const trueNegative = Number(row[idx('true_negative_incl_undecided')]);

      expect(truePositive).toBe(expected.truePositive);
      expect(falsePositive).toBe(expected.falsePositive);
      expect(falseNegative).toBe(expected.falseNegativeInclUndecided);
      expect(trueNegative).toBe(expected.trueNegativeInclUndecided);
      expect(Number(row[idx('undecided_duplicate')])).toBe(expected.undecidedDuplicate);
      expect(Number(row[idx('undecided_distinct')])).toBe(expected.undecidedDistinct);

      expect(truePositive + falsePositive + falseNegative + trueNegative).toBe(CORPUS_SIZE);
      expect(truePositive / (truePositive + falseNegative)).toBeCloseTo(Number(row[idx('recall')]), 4);
      expect(truePositive / (truePositive + falsePositive)).toBeCloseTo(Number(row[idx('precision')]), 4);
    }
  });

  it('Markdown: la línea de matriz de confusión de cada estrategia reconcilia con recall/precisión mostrados, con etiqueta inequívoca', () => {
    const { io, logs } = fakeIo();
    const exitCode = runComparison(['--format', 'markdown'], io);
    expect(exitCode).toBe(0);

    const markdown = logs[0] ?? '';

    for (const expected of EXPECTED_ROWS) {
      const sectionStart = markdown.indexOf(`## ${expected.strategy}`);
      expect(sectionStart).toBeGreaterThanOrEqual(0);
      const confusionLineMatch = /Matriz de confusión:.*$/m.exec(markdown.slice(sectionStart));
      expect(confusionLineMatch).not.toBeNull();
      const confusionLine = confusionLineMatch?.[0] ?? '';

      // Etiqueta inequívoca: dice explícitamente que FN/TN incluyen indecisos.
      expect(confusionLine).toContain('FN (incl. indecisos)=');
      expect(confusionLine).toContain('TN (incl. indecisos)=');
      expect(confusionLine).toContain(`FN (incl. indecisos)=${expected.falseNegativeInclUndecided.toString()}`);
      expect(confusionLine).toContain(`TN (incl. indecisos)=${expected.trueNegativeInclUndecided.toString()}`);
      expect(confusionLine).toContain(`undecided_duplicate=${expected.undecidedDuplicate.toString()}`);
      expect(confusionLine).toContain(`undecided_distinct=${expected.undecidedDistinct.toString()}`);

      expect(
        expected.truePositive + expected.falsePositive + expected.falseNegativeInclUndecided + expected.trueNegativeInclUndecided
      ).toBe(CORPUS_SIZE);
    }
  });
});

// ROADMAP 2.2 — renderMarkdown/renderJson/renderCsv (decisión 091): tres
// formas deterministas del mismo ComparisonReport. Determinista significa
// SIN reloj y SIN configuración regional: `toFixed(4)` fijo, orden de
// columnas y de estrategias fijo (el orden de report.strategies, nunca
// reordenado aquí) — dos ejecuciones sobre la misma entrada producen bytes
// idénticos en cada formato (spec "Repeated runs match").
import type { BandThresholds, BinaryMetrics, Interval, StrategyEvaluation } from '@buscahogar/core';

import type { ComparisonReport } from './report.js';

function formatNumber(value: number): string {
  return value.toFixed(4);
}

// null → "n/a" en Markdown (spec: "null renders as 'n/a' in MD").
function mdNumber(value: number | null): string {
  return value === null ? 'n/a' : formatNumber(value);
}

function mdInterval(interval: Interval | null): string {
  return interval === null ? 'n/a' : `[${formatNumber(interval.low)}, ${formatNumber(interval.high)}]`;
}

// null → campo vacío en CSV (spec: "empty field for CSV").
function csvNumber(value: number | null): string {
  return value === null ? '' : formatNumber(value);
}

// RFC 4180: comillas dobles cuando el campo contiene coma, comilla o salto
// de línea; comilla interna duplicada. El propio `caveat` (report.ts) trae
// una coma real, así que esta ruta se ejercita en cada fila.
function csvField(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

interface ReportRow {
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly isDefault: boolean;
  readonly thresholds: BandThresholds;
  readonly metrics: BinaryMetrics;
}

function buildRows(report: ComparisonReport): readonly ReportRow[] {
  const rows: ReportRow[] = [];
  for (const strategy of report.strategies) {
    rows.push({
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      isDefault: true,
      thresholds: strategy.defaultThresholds,
      metrics: strategy.atDefault,
    });
    for (const point of strategy.sweep) {
      rows.push({
        strategyName: strategy.name,
        strategyVersion: strategy.version,
        isDefault: false,
        thresholds: point.thresholds,
        metrics: point.metrics,
      });
    }
  }
  return rows;
}

// JSON: los campos `corpusSize`/`caveat` ya viven en la raíz de
// `ComparisonReport` (report.ts) — JSON.stringify los expone sin
// transformación adicional (spec "JSON MUST carry them as data at the
// report root").
export function renderJson(report: ComparisonReport): string {
  return JSON.stringify(report, null, 2);
}

export const CSV_COLUMNS = [
  'strategy',
  'strategy_version',
  'is_default',
  'high',
  'low',
  'true_positive',
  'false_positive',
  'false_negative',
  'true_negative',
  'undecided_duplicate',
  'undecided_distinct',
  'precision',
  'precision_low',
  'precision_high',
  'recall',
  'recall_low',
  'recall_high',
  'f1',
  'undecided_rate',
  'undecided_rate_low',
  'undecided_rate_high',
  'corpus_size',
  'caveat',
] as const;

export function renderCsv(report: ComparisonReport): string {
  const rows = buildRows(report);
  const lines = rows.map((row) => {
    const { counts, precision, recall, f1, undecidedRate } = row.metrics;
    const fields = [
      row.strategyName,
      row.strategyVersion,
      row.isDefault ? 'true' : 'false',
      formatNumber(row.thresholds.high),
      formatNumber(row.thresholds.low),
      counts.truePositive.toString(),
      counts.falsePositive.toString(),
      counts.falseNegative.toString(),
      counts.trueNegative.toString(),
      counts.undecidedDuplicate.toString(),
      counts.undecidedDistinct.toString(),
      csvNumber(precision.value),
      csvNumber(precision.wilson95?.low ?? null),
      csvNumber(precision.wilson95?.high ?? null),
      csvNumber(recall.value),
      csvNumber(recall.wilson95?.low ?? null),
      csvNumber(recall.wilson95?.high ?? null),
      csvNumber(f1),
      csvNumber(undecidedRate.value),
      csvNumber(undecidedRate.wilson95?.low ?? null),
      csvNumber(undecidedRate.wilson95?.high ?? null),
      report.corpusSize.toString(),
      report.caveat,
    ];
    return fields.map(csvField).join(',');
  });

  // Fin de línea CRLF por RFC 4180 estricto; ninguna línea de comentario ni
  // fila extra — cabecera + una fila por combinación estrategia×umbral.
  return [CSV_COLUMNS.join(','), ...lines].join('\r\n');
}

function renderMetricsTable(metrics: BinaryMetrics): string {
  const { counts, precision, recall, f1, undecidedRate } = metrics;
  const header = '| Métrica | Valor | IC 95% (Wilson) |\n|---|---|---|';
  const rows = [
    `| Precisión | ${mdNumber(precision.value)} | ${mdInterval(precision.wilson95)} |`,
    `| Recall | ${mdNumber(recall.value)} | ${mdInterval(recall.wilson95)} |`,
    `| F1 | ${mdNumber(f1)} | n/a |`,
    `| Tasa de indecisos | ${mdNumber(undecidedRate.value)} | ${mdInterval(undecidedRate.wilson95)} |`,
  ];
  const confusion =
    `Matriz de confusión: TP=${counts.truePositive.toString()} FP=${counts.falsePositive.toString()} ` +
    `FN=${counts.falseNegative.toString()} TN=${counts.trueNegative.toString()} ` +
    `undecided_duplicate=${counts.undecidedDuplicate.toString()} undecided_distinct=${counts.undecidedDistinct.toString()}`;
  return [header, ...rows, '', confusion].join('\n');
}

function renderSweepTable(strategy: StrategyEvaluation): string {
  const header = '| high | low | precision | recall | f1 | undecided_rate |\n|---|---|---|---|---|---|';
  const rows = strategy.sweep.map((point) => {
    const { precision, recall, f1, undecidedRate } = point.metrics;
    return (
      `| ${formatNumber(point.thresholds.high)} | ${formatNumber(point.thresholds.low)} | ` +
      `${mdNumber(precision.value)} | ${mdNumber(recall.value)} | ${mdNumber(f1)} | ${mdNumber(undecidedRate.value)} |`
    );
  });
  return [header, ...rows].join('\n');
}

export function renderMarkdown(report: ComparisonReport): string {
  const sections: string[] = [
    '# Comparación de estrategias de deduplicación',
    '',
    `${report.corpusSize.toString()} pares evaluados. ${report.caveat}`,
    '',
    '## Limitaciones',
    '',
    ...report.limitations.map((limitation) => `- ${limitation}`),
  ];

  for (const strategy of report.strategies) {
    sections.push(
      '',
      `## ${strategy.name} (v${strategy.version})`,
      '',
      `### Umbral por defecto (high=${formatNumber(strategy.defaultThresholds.high)}, low=${formatNumber(strategy.defaultThresholds.low)})`,
      '',
      renderMetricsTable(strategy.atDefault),
      '',
      `### Rejilla de umbrales (${strategy.sweep.length.toString()} puntos)`,
      '',
      renderSweepTable(strategy)
    );
  }

  return sections.join('\n');
}

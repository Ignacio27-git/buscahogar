// ROADMAP 2.2 — renderMarkdown/renderJson/renderCsv (decisión 091): tres
// formas deterministas del mismo ComparisonReport. Determinista significa
// SIN reloj y SIN configuración regional: `toFixed(4)` fijo, orden de
// columnas y de estrategias fijo (el orden de report.strategies, nunca
// reordenado aquí) — dos ejecuciones sobre la misma entrada producen bytes
// idénticos en cada formato (spec "Repeated runs match").
//
// Corrección post-verify (verify-report WARNING-1, D2/decisión 089): el
// artefacto exportado debe reconciliar con recall = TP/(TP+FN) y precision =
// TP/(TP+FP) usando SOLO las cifras visibles. `ConfusionCounts` (core)
// mantiene sus 6 casillas mutuamente excluyentes sin cambios (decisión 089,
// metrics.test.ts) — ese modelo es correcto y ya usa `undecidedDuplicate`
// como negativo en el propio cálculo de recall. El defecto estaba aquí:
// esta capa de render reexponía `counts.falseNegative`/`counts.trueNegative`
// crudos (solo el `reject` explícito), que NO son la cifra que recall usa.
// `reconcileCounts` calcula, solo para el artefacto exportado, el total que
// SÍ reconcilia (D2: undecided cuenta como negativo) y las columnas/campos
// `undecided_duplicate`/`undecided_distinct` se conservan como desglose "de
// las cuales indecisas". No se toca metrics.ts/report.ts/evaluate.ts: P/R/F1
// /undecided-rate/Wilson no cambian, solo lo que este render muestra bajo
// FN/TN.
import type { BandThresholds, BinaryMetrics, ConfusionCounts, Interval, StrategyEvaluation } from '@buscahogar/core';

import type { ComparisonReport } from './report.js';

interface ReconciledCounts {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegativeInclUndecided: number;
  readonly trueNegativeInclUndecided: number;
  readonly undecidedDuplicate: number;
  readonly undecidedDistinct: number;
}

// D2/decisión 089: un duplicado real bandeado `undecided` es un fallo de
// recall igual que uno bandeado `reject`, así que el FN expuesto es la suma
// de ambos (mismo razonamiento para TN/distinct). `undecidedDuplicate`/
// `undecidedDistinct` NO se restan de nada — se exponen aparte, sin cambiar
// (siguen siendo la misma cifra que ya mostraba el reporte).
function reconcileCounts(counts: ConfusionCounts): ReconciledCounts {
  return {
    truePositive: counts.truePositive,
    falsePositive: counts.falsePositive,
    falseNegativeInclUndecided: counts.falseNegative + counts.undecidedDuplicate,
    trueNegativeInclUndecided: counts.trueNegative + counts.undecidedDistinct,
    undecidedDuplicate: counts.undecidedDuplicate,
    undecidedDistinct: counts.undecidedDistinct,
  };
}

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
// `ComparisonReport` (report.ts) — se exponen sin transformación adicional
// (spec "JSON MUST carry them as data at the report root"). SOLO
// `counts` (dentro de `atDefault` y de cada punto del `sweep`, en las dos
// estrategias) se reescribe con `reconcileCounts` — el resto de cada
// `BinaryMetrics` (precision/recall/f1/undecidedRate) y el resto del report
// (pairs, grid, limitations...) se copian tal cual, sin reordenar ni omitir
// nada.
interface ReconciledMetrics extends Omit<BinaryMetrics, 'counts'> {
  readonly counts: ReconciledCounts;
}

interface ReconciledSweepPoint {
  readonly thresholds: BandThresholds;
  readonly metrics: ReconciledMetrics;
}

interface ReconciledStrategyEvaluation extends Omit<StrategyEvaluation, 'atDefault' | 'sweep'> {
  readonly atDefault: ReconciledMetrics;
  readonly sweep: readonly ReconciledSweepPoint[];
}

function reconcileMetrics(metrics: BinaryMetrics): ReconciledMetrics {
  return { ...metrics, counts: reconcileCounts(metrics.counts) };
}

function reconcileStrategy(strategy: StrategyEvaluation): ReconciledStrategyEvaluation {
  return {
    ...strategy,
    atDefault: reconcileMetrics(strategy.atDefault),
    sweep: strategy.sweep.map((point) => ({ ...point, metrics: reconcileMetrics(point.metrics) })),
  };
}

export function renderJson(report: ComparisonReport): string {
  const rendered = { ...report, strategies: report.strategies.map(reconcileStrategy) };
  return JSON.stringify(rendered, null, 2);
}

export const CSV_COLUMNS = [
  'strategy',
  'strategy_version',
  'is_default',
  'high',
  'low',
  'true_positive',
  'false_positive',
  // Corrección WARNING-1 (D2/decisión 089): estas dos columnas ya NO son el
  // `reject` crudo — incluyen los pares `undecided` correspondientes,
  // exactamente igual que el denominador real de recall/precisión. El
  // nombre deja la inclusión explícita para que no se confunda con
  // `counts.falseNegative`/`trueNegative` "crudos" de `ConfusionCounts`
  // (core), que siguen existiendo sin cambios pero ya no se exportan aquí.
  'false_negative_incl_undecided',
  'true_negative_incl_undecided',
  // Desglose "de las cuales indecisas" — mismas columnas/cifras de siempre.
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
    const { precision, recall, f1, undecidedRate } = row.metrics;
    const counts = reconcileCounts(row.metrics.counts);
    const fields = [
      row.strategyName,
      row.strategyVersion,
      row.isDefault ? 'true' : 'false',
      formatNumber(row.thresholds.high),
      formatNumber(row.thresholds.low),
      counts.truePositive.toString(),
      counts.falsePositive.toString(),
      counts.falseNegativeInclUndecided.toString(),
      counts.trueNegativeInclUndecided.toString(),
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
  const { precision, recall, f1, undecidedRate } = metrics;
  const counts = reconcileCounts(metrics.counts);
  const header = '| Métrica | Valor | IC 95% (Wilson) |\n|---|---|---|';
  const rows = [
    `| Precisión | ${mdNumber(precision.value)} | ${mdInterval(precision.wilson95)} |`,
    `| Recall | ${mdNumber(recall.value)} | ${mdInterval(recall.wilson95)} |`,
    `| F1 | ${mdNumber(f1)} | n/a |`,
    `| Tasa de indecisos | ${mdNumber(undecidedRate.value)} | ${mdInterval(undecidedRate.wilson95)} |`,
  ];
  // Corrección WARNING-1 (D2/decisión 089): "FN (incl. indecisos)"/"TN
  // (incl. indecisos)" dejan explícito que estas cifras ya suman el
  // `undecided` correspondiente — reconcilian con Recall/Precisión de
  // arriba (TP/(TP+FN) y TP/(TP+FP)), a diferencia del `reject` crudo que
  // mostraba esta línea antes de la corrección.
  const confusion =
    `Matriz de confusión: TP=${counts.truePositive.toString()} FP=${counts.falsePositive.toString()} ` +
    `FN (incl. indecisos)=${counts.falseNegativeInclUndecided.toString()} TN (incl. indecisos)=${counts.trueNegativeInclUndecided.toString()} ` +
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

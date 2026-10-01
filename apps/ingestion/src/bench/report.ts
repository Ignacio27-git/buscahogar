// ROADMAP 2.4 (search-indexing-performance) — report.ts (diseño decisión 9,
// "Before/After Report"; fase 2, tarea 2.6). `BenchRunSchema` valida la
// forma de un fichero de tanda escrito por `scripts/bench-search.ts` en
// `.bench/` (gitignored, nunca committeado); `mergeRuns` fusiona varias
// tandas (una combinación puede venir de un fichero distinto en modo
// `restart`, que exige UNA combinación por invocación); `renderReport`
// compone el markdown final. Módulo PURO: no lee ficheros ni abre conexión
// — eso es responsabilidad del script que lo invoca.
import { z } from 'zod';

import { BENCH_COMBINATION_IDS, COLD_MODES, MAP_GATE_PAIRS } from './bench-options.js';
import type { BenchCombinationId, ColdMode } from './bench-options.js';
import type { PlanSummary } from './measure.js';

// -----------------------------------------------------------------------
// Tipos públicos (declarados a mano, no `z.infer`, para que todos los
// arrays sean `readonly` de forma consistente con `PlanSummary`,
// measure.ts — `z.array()` infiere arrays MUTABLES por defecto, lo que
// obligaría a copiar en cada frontera). Los esquemas Zod de abajo validan
// exactamente esta forma; `.parse()` devuelve un array mutable, que sigue
// siendo asignable a estos tipos de solo lectura sin ningún cast.
// -----------------------------------------------------------------------

export interface BenchCombinationRun {
  readonly id: BenchCombinationId;
  readonly description: string;
  readonly coldMethod: ColdMode;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly coldMs: number;
  readonly plan: PlanSummary;
}

export interface BenchRun {
  readonly generatedAt: string;
  readonly combinations: readonly BenchCombinationRun[];
}

// -----------------------------------------------------------------------
// Esquema del fichero de tanda (diseño decisión 9: "BenchRunSchema, Zod")
// -----------------------------------------------------------------------

const PlanNodeSchema = z.object({
  nodeType: z.string().min(1),
  relationName: z.string().optional(),
  indexName: z.string().optional(),
});

const PlanSummarySchema = z.object({
  nodes: z.array(PlanNodeSchema),
  executionMs: z.number().nonnegative(),
  planningMs: z.number().nonnegative(),
  sharedHit: z.number().nonnegative(),
  sharedRead: z.number().nonnegative(),
  jitMs: z.number().nonnegative().nullable(),
  maxSubPlanLoops: z.number().nonnegative(),
});

const BenchCombinationRunSchema = z.object({
  id: z.enum(BENCH_COMBINATION_IDS),
  description: z.string().min(1),
  coldMethod: z.enum(COLD_MODES),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  coldMs: z.number().nonnegative(),
  plan: PlanSummarySchema,
});

export const BenchRunSchema = z.object({
  generatedAt: z.string().min(1),
  combinations: z.array(BenchCombinationRunSchema).min(1),
});

// -----------------------------------------------------------------------
// mergeRuns (diseño decisión 9: "merged by combination id; duplicate or
// missing ids are rejected")
// -----------------------------------------------------------------------

export class DuplicateCombinationIdError extends Error {}
export class MissingCombinationIdsError extends Error {}

// `requireComplete: false` es para `--baseline`: una tanda de 2.4/2.5 solo trae
// los 12 ids antiguos y `renderRow` ya tolera una fila base ausente. Solo
// `--input` exige los 19 ids; los duplicados se rechazan siempre.
export interface MergeRunsOptions {
  readonly requireComplete?: boolean;
}

export function mergeRuns(runs: readonly BenchRun[], options: MergeRunsOptions = {}): readonly BenchCombinationRun[] {
  const requireComplete = options.requireComplete ?? true;
  const byId = new Map<BenchCombinationId, BenchCombinationRun>();

  for (const run of runs) {
    for (const combination of run.combinations) {
      if (byId.has(combination.id)) {
        throw new DuplicateCombinationIdError(
          `report: la combinación "${combination.id}" aparece en más de un fichero de entrada — cada combinación debe provenir de un único fichero.`
        );
      }
      byId.set(combination.id, combination);
    }
  }

  const missing = BENCH_COMBINATION_IDS.filter((id) => !byId.has(id));
  if (requireComplete && missing.length > 0) {
    throw new MissingCombinationIdsError(
      `report: faltan combinaciones tras fusionar los ficheros de entrada: ${missing.join(', ')}.`
    );
  }

  const merged: BenchCombinationRun[] = [];
  for (const id of BENCH_COMBINATION_IDS) {
    const combination = byId.get(id);
    if (combination !== undefined) {
      merged.push(combination);
    }
  }
  return merged;
}

// -----------------------------------------------------------------------
// renderReport (diseño, "p95 Latency Target with Honest Reporting" — 500 ms;
// docs/ARCHITECTURE.md:159)
// -----------------------------------------------------------------------

export const SEARCH_P95_TARGET_MS = 500;

const COLD_METHOD_LEGEND: Record<(typeof COLD_MODES)[number], string> = {
  evict: 'búferes compartidos vaciados antes de cada corrida en frío (la caché de páginas de WSL2 puede seguir caliente)',
  restart: 'PostgreSQL reiniciado antes de cada corrida en frío (la caché de páginas del sistema operativo puede seguir caliente)',
};

function metLabel(p95Ms: number): string {
  // Spec "Missing combination reported honestly": el incumplimiento se
  // marca siempre, nunca se omite ni se redondea a "cumple".
  return p95Ms < SEARCH_P95_TARGET_MS ? 'cumple' : 'no cumple';
}

function planLabel(plan: BenchCombinationRun['plan']): string {
  const nodeTypes = [...new Set(plan.nodes.map((node) => node.nodeType))];
  const indexNames = [...new Set(plan.nodes.map((node) => node.indexName).filter((name): name is string => name !== undefined))];
  const indexPart = indexNames.length > 0 ? ` (índices: ${indexNames.join(', ')})` : '';
  return `${nodeTypes.join(' → ')}${indexPart}`;
}

function formatMs(value: number): string {
  return value.toFixed(1);
}

function findById(combinations: readonly BenchCombinationRun[], id: BenchCombinationId): BenchCombinationRun | undefined {
  return combinations.find((combination) => combination.id === id);
}

// Sin línea base: una sola columna p50/p95/frío por combinación. Con línea
// base (--baseline, diseño decisión 9): columnas "antes" y "después" para
// cada cifra, y el estado cumple/no cumple se evalúa SIEMPRE sobre el valor
// "después" (el estado real tras aplicar el cambio de índices).
function renderRow(current: BenchCombinationRun, baseline: BenchCombinationRun | undefined): string {
  const p50 = baseline === undefined ? formatMs(current.p50Ms) : `${formatMs(baseline.p50Ms)} → ${formatMs(current.p50Ms)}`;
  const p95 = baseline === undefined ? formatMs(current.p95Ms) : `${formatMs(baseline.p95Ms)} → ${formatMs(current.p95Ms)}`;
  const cold =
    baseline === undefined
      ? `${formatMs(current.coldMs)} (${current.coldMethod})`
      : `${formatMs(baseline.coldMs)} (${baseline.coldMethod}) → ${formatMs(current.coldMs)} (${current.coldMethod})`;

  return `| ${current.id} | ${current.description} | ${p50} | ${p95} | ${cold} | ${metLabel(current.p95Ms)} | ${planLabel(current.plan)} |`;
}

// -----------------------------------------------------------------------
// Gate G1 del mapa (diseño, "Needs maintainer decision"): para cada par
// map-points/map-count, p95(points) + p95(count) debe quedar por debajo de
// 500 ms. Si el recuento SOLO ya lo incumple, apply se detiene y decide el
// mantenedor; si solo incumple la suma, ejecutar ambas consultas en paralelo
// es una corrección técnica que no requiere decisión. Un par al que le falta
// alguna de las dos mediciones (p. ej. tanda parcial con --only) se omite.
// -----------------------------------------------------------------------

function gateVerdict(pointsMs: number, countMs: number): string {
  if (countMs >= SEARCH_P95_TARGET_MS) {
    return 'no cumple: DECISIÓN DEL MANTENEDOR (G1)';
  }
  if (pointsMs + countMs >= SEARCH_P95_TARGET_MS) {
    return 'no cumple: solo la suma; ejecutar points y count en paralelo (sin decisión)';
  }
  return 'cumple';
}

export function renderMapGate(combinations: readonly BenchCombinationRun[]): string {
  const rows: string[] = [];
  let countBreached = false;

  for (const pair of MAP_GATE_PAIRS) {
    const points = findById(combinations, pair.points);
    const count = findById(combinations, pair.count);
    if (points === undefined || count === undefined) {
      continue;
    }
    if (count.p95Ms >= SEARCH_P95_TARGET_MS) {
      countBreached = true;
    }
    rows.push(
      `| ${pair.name} | ${formatMs(points.p95Ms)} | ${formatMs(count.p95Ms)} | ${formatMs(points.p95Ms + count.p95Ms)} | ${gateVerdict(points.p95Ms, count.p95Ms)} |`
    );
  }

  if (rows.length === 0) {
    return '';
  }

  const lines = [
    'Gate G1 (mapa): p95(points) + p95(count) < 500 ms por escenario',
    '',
    '| escenario | p95 points (ms) | p95 count (ms) | suma (ms) | veredicto |',
    '|---|---|---|---|---|',
    ...rows,
  ];
  if (countBreached) {
    lines.push(
      '',
      'El recuento exacto solo ya incumple: el mantenedor elige (a) recuento acotado que muestre "más de 10.000" y siga marcando truncado, (b) un tope de área más bajo, o (c) aceptar el incumplimiento solo en la vista de mapa.'
    );
  }
  return lines.join('\n');
}

export function renderReport(current: readonly BenchCombinationRun[], baseline?: readonly BenchCombinationRun[]): string {
  const header = baseline === undefined
    ? '| id | descripción | p50 (ms) | p95 (ms) | frío (ms, método) | objetivo 500 ms | plan |\n|---|---|---|---|---|---|---|'
    : '| id | descripción | p50 antes → después (ms) | p95 antes → después (ms) | frío antes → después (ms, método) | objetivo 500 ms | plan |\n|---|---|---|---|---|---|---|';

  const rows = current.map((combination) => renderRow(combination, baseline === undefined ? undefined : findById(baseline, combination.id)));

  const legend = [
    'Leyenda de métodos de corrida en frío (diseño decisión 8):',
    `- \`evict\`: ${COLD_METHOD_LEGEND.evict}.`,
    `- \`restart\`: ${COLD_METHOD_LEGEND.restart}.`,
  ].join('\n');

  const gate = renderMapGate(current);
  return [header, ...rows, '', legend, ...(gate === '' ? [] : ['', gate])].join('\n');
}

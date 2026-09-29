// ROADMAP 2.4 (search-indexing-performance) — measure.ts (diseño decisiones
// 6, 7 y "Query Plan Capture"; fase 2, tarea 2.4). Dos utilidades PURAS que
// consume `scripts/bench-search.ts`: `percentile()` sobre las muestras de
// tiempo cálido, y `summarizePlan()` sobre el JSON ya parseado de un
// `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Ninguna de las dos ejecuta SQL
// ni abre conexión — eso vive en el script (diseño, "Data Flow").
export class EmptySampleError extends Error {}

// Nearest-rank (diseño decisión 7: "p50/p95 use nearest-rank; at N=10, p95
// would equal the max"): rank = ceil(p/100 * n), 1-based; nunca interpola
// entre dos muestras, a diferencia de percentiles lineales (tipo Excel).
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) {
    throw new EmptySampleError(`percentile: no se puede calcular el percentil ${String(p)} de una muestra vacía.`);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  const value = sorted[index];
  // Inalcanzable en la práctica: `index` siempre cae dentro de
  // `[0, sorted.length - 1]` por la línea anterior — la comprobación es solo
  // para satisfacer `noUncheckedIndexedAccess` sin un `as number`.
  if (value === undefined) {
    throw new EmptySampleError('percentile: índice fuera de rango (esto no debería ocurrir).');
  }
  return value;
}

// ---------------------------------------------------------------------------
// summarizePlan — recorrido de EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
// (diseño, "Query Plan Capture": "asserts plan properties by structured
// fields … never by matching substrings of rendered plan text"). Mismo
// patrón de recorrido que `packages/db/test/blocking/blocking-plan.test.ts`
// (Node Type/Relation Name/Index Name como claves del JSON), extendido con
// las métricas de nivel superior (Execution/Planning Time, JIT) y con la
// suma de buffers y el máximo de vueltas de un SubPlan (diseño, "Watch:
// SubPlans on OFFSET rows"; interfaz PlanSummary).
export interface PlanNodeSummary {
  readonly nodeType: string;
  readonly relationName?: string;
  readonly indexName?: string;
}

export interface PlanSummary {
  readonly nodes: readonly PlanNodeSummary[];
  readonly executionMs: number;
  readonly planningMs: number;
  readonly sharedHit: number;
  readonly sharedRead: number;
  readonly jitMs: number | null;
  readonly maxSubPlanLoops: number;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

interface WalkAccumulator {
  readonly nodes: PlanNodeSummary[];
  maxSubPlanLoops: number;
}

// Recorre cualquier objeto o array: los nodos hijos cuelgan de la clave
// "Plans" (y el nodo raíz de la respuesta cuelga de "Plan"), así que
// caminar TODO el árbol sin distinguir la forma es lo único que no se
// pierde ningún nodo anidado, incluidos los SubPlan. NOTA (corrección,
// hallazgo WARNING del validador): este recorrido YA NO acumula Shared
// Hit/Read Blocks — PostgreSQL reporta esos contadores de forma INCLUSIVA
// (el valor de un nodo ya incluye el de todos sus hijos), así que sumarlos
// por cada nodo del árbol los contaría varias veces. La única lectura
// correcta es la del nodo RAÍZ (ver `summarizePlan`).
function walk(node: unknown, acc: WalkAccumulator): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, acc);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const nodeType = readString(record, 'Node Type');
  if (nodeType !== undefined) {
    acc.nodes.push({
      nodeType,
      relationName: readString(record, 'Relation Name'),
      indexName: readString(record, 'Index Name'),
    });
    if (readString(record, 'Parent Relationship') === 'SubPlan') {
      acc.maxSubPlanLoops = Math.max(acc.maxSubPlanLoops, readNumber(record, 'Actual Loops'));
    }
  }

  for (const value of Object.values(record)) walk(value, acc);
}

export function summarizePlan(rawPlan: unknown): PlanSummary {
  const results = Array.isArray(rawPlan) ? rawPlan : [rawPlan];
  const topLevel = (results[0] ?? {}) as Record<string, unknown>;
  // Corrección: Shared Hit/Read Blocks se leen SOLO del nodo raíz del plan
  // (`topLevel.Plan`), nunca sumados sobre el árbol — ya son inclusivos de
  // todo lo que cuelga de él.
  const rootNode = (topLevel.Plan ?? {}) as Record<string, unknown>;

  const acc: WalkAccumulator = { nodes: [], maxSubPlanLoops: 0 };
  walk(topLevel.Plan, acc);

  const jit = topLevel.JIT as Record<string, unknown> | undefined;
  const jitTiming = jit?.Timing as Record<string, unknown> | undefined;
  const jitMs = jitTiming !== undefined ? readNumber(jitTiming, 'Total') : null;

  return {
    nodes: acc.nodes,
    executionMs: readNumber(topLevel, 'Execution Time'),
    planningMs: readNumber(topLevel, 'Planning Time'),
    sharedHit: readNumber(rootNode, 'Shared Hit Blocks'),
    sharedRead: readNumber(rootNode, 'Shared Read Blocks'),
    jitMs,
    maxSubPlanLoops: acc.maxSubPlanLoops,
  };
}

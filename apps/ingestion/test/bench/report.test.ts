// ROADMAP 2.4 (search-indexing-performance) — report.test.ts (diseño
// decisión 9, "Before/After Report"; fase 2, tarea 2.5). `BenchRunSchema`
// valida la forma de UN fichero de tanda (`.bench/*.json`, gitignored);
// `mergeRuns` fusiona varios ficheros por id de combinación, rechazando
// duplicados o combinaciones ausentes; `renderReport` produce el markdown
// final (met/missed a 500 ms, columna de corrida en frío + método, y el
// diff antes/después cuando se pasa una línea base).
import { describe, expect, it } from 'vitest';

import { BENCH_COMBINATION_IDS } from '../../src/bench/bench-options.js';
import type { BenchCombinationId } from '../../src/bench/bench-options.js';
import {
  BenchRunSchema,
  DuplicateCombinationIdError,
  MissingCombinationIdsError,
  mergeRuns,
  renderMapGate,
  renderReport,
} from '../../src/bench/report.js';
import type { BenchCombinationRun, BenchRun } from '../../src/bench/report.js';

const EMPTY_PLAN = {
  nodes: [{ nodeType: 'Seq Scan', relationName: 'properties' }],
  executionMs: 1,
  planningMs: 0.1,
  sharedHit: 10,
  sharedRead: 0,
  jitMs: null,
  maxSubPlanLoops: 0,
};

function combinationRun(id: BenchCombinationId, overrides: Partial<BenchCombinationRun> = {}): BenchCombinationRun {
  return {
    id,
    description: `descripción de ${id}`,
    coldMethod: 'evict',
    p50Ms: 50,
    p95Ms: 90,
    coldMs: 200,
    plan: EMPTY_PLAN,
    ...overrides,
  };
}

function runFile(combinations: readonly BenchCombinationRun[]): BenchRun {
  return { generatedAt: '2026-01-01T00:00:00.000Z', combinations };
}

describe('BenchRunSchema (diseño decisión 9)', () => {
  it('valida un fichero de tanda bien formado', () => {
    const parsed = BenchRunSchema.parse(runFile([combinationRun('default')]));
    expect(parsed.combinations).toHaveLength(1);
  });

  it('rechaza un id de combinación desconocido', () => {
    const invalid = { generatedAt: '2026-01-01T00:00:00.000Z', combinations: [{ ...combinationRun('default'), id: 'no-existe' }] };
    expect(() => BenchRunSchema.parse(invalid)).toThrow();
  });
});

describe('mergeRuns (diseño decisión 9: "merged by combination id; duplicate or missing ids are rejected")', () => {
  it('fusiona varios ficheros y devuelve las 12 combinaciones en el orden de BENCH_COMBINATION_IDS', () => {
    const half = Math.floor(BENCH_COMBINATION_IDS.length / 2);
    const firstHalf = BENCH_COMBINATION_IDS.slice(0, half).map((id) => combinationRun(id));
    const secondHalf = BENCH_COMBINATION_IDS.slice(half).map((id) => combinationRun(id));

    const merged = mergeRuns([runFile(firstHalf), runFile(secondHalf)]);

    expect(merged).toHaveLength(BENCH_COMBINATION_IDS.length);
    expect(merged.map((combination) => combination.id)).toEqual(BENCH_COMBINATION_IDS);
  });

  it('rechaza cuando la misma combinación aparece en más de un fichero', () => {
    const fileA = runFile(BENCH_COMBINATION_IDS.map((id) => combinationRun(id)));
    const fileB = runFile([combinationRun('default')]);
    expect(() => mergeRuns([fileA, fileB])).toThrow(DuplicateCombinationIdError);
  });

  it('rechaza cuando faltan combinaciones tras fusionar todos los ficheros', () => {
    const incomplete = runFile([combinationRun('default'), combinationRun('op-type')]);
    expect(() => mergeRuns([incomplete])).toThrow(MissingCombinationIdsError);
  });
});

describe('renderReport (diseño, "p95 Latency Target with Honest Reporting" — objetivo 500 ms)', () => {
  const fullSet = BENCH_COMBINATION_IDS.map((id) => combinationRun(id));

  it('marca como cumplida una combinación con p95 < 500 ms', () => {
    const markdown = renderReport(fullSet);
    const line = markdown.split('\n').find((row) => row.includes('| default |'));
    expect(line).toMatch(/cumple/);
    expect(line).not.toMatch(/no cumple/);
  });

  it('marca como incumplida (nunca omitida) una combinación con p95 >= 500 ms', () => {
    const withMiss = fullSet.map((combination) => (combination.id === 'deep-default' ? combinationRun('deep-default', { p95Ms: 640 }) : combination));
    const markdown = renderReport(withMiss);
    const line = markdown.split('\n').find((row) => row.includes('| deep-default |'));
    expect(line).toMatch(/no cumple/);
  });

  it('incluye la corrida en frío y el método (evict/restart) de cada combinación, más la leyenda de ambos métodos', () => {
    const mixed = fullSet.map((combination) =>
      combination.id === 'geo-1km' ? combinationRun('geo-1km', { coldMethod: 'restart', coldMs: 777 }) : combination
    );
    const markdown = renderReport(mixed);
    const line = markdown.split('\n').find((row) => row.includes('| geo-1km |'));
    expect(line).toContain('777');
    expect(line).toContain('restart');
    expect(markdown).toMatch(/evict/);
    expect(markdown).toMatch(/restart/);
  });

  it('con --baseline, renderiza columnas de antes y de después para la misma combinación', () => {
    const baseline = fullSet.map((combination) => (combination.id === 'default' ? combinationRun('default', { p95Ms: 900 }) : combination));
    const current = fullSet.map((combination) => (combination.id === 'default' ? combinationRun('default', { p95Ms: 120 }) : combination));

    const markdown = renderReport(current, baseline);
    const line = markdown.split('\n').find((row) => row.includes('| default |'));

    expect(line).toContain('900');
    expect(line).toContain('120');
  });
});

// ROADMAP 2.6 (diseño, gate G1): para cada par map-points/map-count se suma el
// p95 de ambas consultas. Si el recuento SOLO ya rompe los 500 ms, apply se
// detiene y decide el mantenedor; si solo rompe la suma, la corrección es
// técnica (ejecutar en paralelo) y no requiere decisión.
describe('renderMapGate (diseño, gate G1 del mapa)', () => {
  function withP95(points: number, count: number): readonly BenchCombinationRun[] {
    return BENCH_COMBINATION_IDS.map((id) => {
      if (id === 'map-points-default') return combinationRun(id, { p95Ms: points });
      if (id === 'map-count-default') return combinationRun(id, { p95Ms: count });
      return combinationRun(id);
    });
  }

  function defaultLine(markdown: string): string {
    const line = markdown.split('\n').find((row) => row.includes('| default |'));
    if (line === undefined) throw new Error(`Sin fila "default" en el gate:\n${markdown}`);
    return line;
  }

  it('suma los p95 de points y count y marca cumple cuando la suma queda por debajo de 500 ms', () => {
    const line = defaultLine(renderMapGate(withP95(120, 200)));
    expect(line).toContain('320.0');
    expect(line).toMatch(/cumple/);
    expect(line).not.toMatch(/no cumple|DECISI/);
  });

  it('el recuento solo >= 500 ms exige decisión del mantenedor (G1) aunque points sea rápido', () => {
    const markdown = renderMapGate(withP95(10, 510));
    const line = defaultLine(markdown);
    expect(line).toMatch(/DECISIÓN DEL MANTENEDOR/);
    expect(markdown).toMatch(/más de 10.000/);
    expect(markdown).toMatch(/tope de área/);
  });

  it('solo la suma >= 500 ms (count < 500) propone ejecutar en paralelo, sin decisión', () => {
    const line = defaultLine(renderMapGate(withP95(300, 300)));
    expect(line).toMatch(/no cumple/);
    expect(line).toMatch(/paralelo/);
    expect(line).not.toMatch(/DECISIÓN DEL MANTENEDOR/);
  });

  it('un par ausente se omite: sin ningún par la sección queda vacía', () => {
    expect(renderMapGate([combinationRun('default')])).toBe('');
  });

  it('renderReport añade la sección del gate G1 con el conjunto completo', () => {
    const markdown = renderReport(withP95(10, 510));
    expect(markdown).toMatch(/Gate G1/);
    expect(markdown).toMatch(/DECISIÓN DEL MANTENEDOR/);
  });
});

// Corrección ROADMAP 2.6: la línea base puede venir de una tanda de 12 ids
// (2.4/2.5); solo `--input` exige los 19.
describe('mergeRuns con requireComplete: false (línea base antigua)', () => {
  const OLD_IDS = BENCH_COMBINATION_IDS.slice(0, 12);

  it('tolera ids ausentes y conserva el orden de BENCH_COMBINATION_IDS', () => {
    const merged = mergeRuns([runFile(OLD_IDS.map((id) => combinationRun(id)))], { requireComplete: false });
    expect(merged.map((c) => c.id)).toEqual(OLD_IDS);
  });

  it('sigue rechazando ids duplicados', () => {
    const files = [runFile(OLD_IDS.map((id) => combinationRun(id))), runFile([combinationRun('default')])];
    expect(() => mergeRuns(files, { requireComplete: false })).toThrow(DuplicateCombinationIdError);
  });

  it('por defecto sigue exigiendo completitud', () => {
    expect(() => mergeRuns([runFile(OLD_IDS.map((id) => combinationRun(id)))])).toThrow(MissingCombinationIdsError);
  });
});

describe('límites del veredicto (objetivo 500 ms)', () => {
  function gateFor(points: number, count: number): string {
    const set = BENCH_COMBINATION_IDS.map((id) =>
      id === 'map-points-default'
        ? combinationRun(id, { p95Ms: points })
        : id === 'map-count-default'
          ? combinationRun(id, { p95Ms: count })
          : combinationRun(id)
    );
    const line = renderMapGate(set).split('\n').find((row) => row.includes('| default |'));
    if (line === undefined) throw new Error('sin fila default');
    return line;
  }

  it('G1: count exactamente 500 ms exige decisión del mantenedor', () => {
    expect(gateFor(10, 500)).toMatch(/DECISIÓN DEL MANTENEDOR/);
  });

  it('G1: count 499.9 con points 0.1 (suma exactamente 500) propone paralelo, sin decisión', () => {
    const line = gateFor(0.1, 499.9);
    expect(line).toMatch(/paralelo/);
    expect(line).not.toMatch(/DECISIÓN/);
  });

  it('G1: points + count exactamente 500 ms (300 + 200) propone paralelo', () => {
    expect(gateFor(300, 200)).toMatch(/paralelo/);
  });

  it('G1: suma 499.9 cumple', () => {
    const line = gateFor(300, 199.9);
    expect(line).toMatch(/cumple/);
    expect(line).not.toMatch(/no cumple/);
  });

  it('G2: fila de lista polygon-small con p95 500 no cumple y con 499.9 cumple', () => {
    const rowFor = (p95: number): string => {
      const set = BENCH_COMBINATION_IDS.map((id) => (id === 'polygon-small' ? combinationRun(id, { p95Ms: p95 }) : combinationRun(id)));
      const line = renderReport(set).split('\n').find((row) => row.includes('| polygon-small |'));
      if (line === undefined) throw new Error('sin fila polygon-small');
      return line;
    };
    expect(rowFor(500)).toMatch(/no cumple/);
    expect(rowFor(499.9)).not.toMatch(/no cumple/);
    expect(rowFor(499.9)).toMatch(/cumple/);
  });
});

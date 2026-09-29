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

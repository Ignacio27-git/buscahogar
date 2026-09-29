// ROADMAP 2.4 (search-indexing-performance) — render-bench-report.test.ts.
// CORRECCIÓN (validador, hallazgo CRÍTICO "the spec's before/after report
// cannot be produced"): ninguna CLI conectaba `mergeRuns`/`renderReport`
// (report.ts, fase 2, tareas 2.5/2.6, ya implementados y testeados como
// funciones puras) con ficheros reales de `.bench/`. Este test prueba
// `runRenderReport` con un `io` falso (lectura/escritura EN MEMORIA, sin
// tocar el sistema de ficheros real ni ninguna base de datos): fusión de
// varios ficheros de tanda modo `restart` (una combinación por fichero, tal
// como los produce `bench-search.ts --only <id> --cold-mode restart`),
// rechazo con un error nombrado ante id duplicado o ausente tras fusionar, y
// el diff antes/después cuando se pasa `--baseline`.
import { describe, expect, it } from 'vitest';

import { BENCH_COMBINATION_IDS } from '../src/bench/bench-options.js';
import type { BenchCombinationId } from '../src/bench/bench-options.js';
import type { BenchCombinationRun, BenchRun } from '../src/bench/report.js';

import { RenderReportOptionsError, parseRenderReportArgs, runRenderReport } from '../scripts/render-bench-report.js';
import type { RenderReportIo } from '../scripts/render-bench-report.js';

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
    coldMethod: 'restart',
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

function fakeIo(files: Readonly<Record<string, string>>): { io: RenderReportIo; written: Record<string, string>; logs: string[] } {
  const written: Record<string, string> = {};
  const logs: string[] = [];
  const io: RenderReportIo = {
    readFile: (path: string): Promise<string> => {
      const content = files[path];
      if (content === undefined) {
        return Promise.reject(new Error(`fichero no encontrado en el fake io: ${path}`));
      }
      return Promise.resolve(content);
    },
    writeFile: (path: string, text: string): Promise<void> => {
      written[path] = text;
      return Promise.resolve();
    },
    log: (line: string): void => void logs.push(line),
  };
  return { io, written, logs };
}

describe('parseRenderReportArgs (esquema Zod propio del renderer, nunca conecta a base de datos)', () => {
  it('exige --input (al menos un fichero)', () => {
    expect(() => parseRenderReportArgs([])).toThrow(RenderReportOptionsError);
  });

  it('acepta --input múltiple, --baseline opcional y --out opcional', () => {
    const options = parseRenderReportArgs(['--input', 'a.json', '--input', 'b.json', '--baseline', 'base.json', '--out', 'out.md']);
    expect(options.input).toEqual(['a.json', 'b.json']);
    expect(options.baseline).toEqual(['base.json']);
    expect(options.out).toBe('out.md');
  });

  it('--baseline es opcional: sin línea base, options.baseline es un array vacío', () => {
    const options = parseRenderReportArgs(['--input', 'a.json']);
    expect(options.baseline).toEqual([]);
    expect(options.out).toBeUndefined();
  });
});

describe('runRenderReport — fusión de ficheros modo restart, error nombrado, diff --baseline', () => {
  it('fusiona varios ficheros modo restart (una combinación cada uno) y renderiza las 12 combinaciones', async () => {
    const files: Record<string, string> = {};
    for (const id of BENCH_COMBINATION_IDS) {
      files[`${id}.json`] = JSON.stringify(runFile([combinationRun(id)]));
    }
    const { io, logs } = fakeIo(files);

    const exitCode = await runRenderReport(BENCH_COMBINATION_IDS.flatMap((id) => ['--input', `${id}.json`]), io);

    expect(exitCode).toBe(0);
    const markdown = logs.join('\n');
    for (const id of BENCH_COMBINATION_IDS) {
      expect(markdown).toContain(`| ${id} |`);
    }
  });

  it('rechaza con un error nombrado cuando el mismo id de combinación aparece en más de un fichero de --input', async () => {
    const files: Record<string, string> = {
      'a.json': JSON.stringify(runFile(BENCH_COMBINATION_IDS.map((id) => combinationRun(id)))),
      'b.json': JSON.stringify(runFile([combinationRun('default')])),
    };
    const { io, logs } = fakeIo(files);

    const exitCode = await runRenderReport(['--input', 'a.json', '--input', 'b.json'], io);

    expect(exitCode).not.toBe(0);
    expect(logs.some((line) => /aparece en más de un fichero/.test(line))).toBe(true);
  });

  it('rechaza con un error nombrado cuando faltan combinaciones tras fusionar --input', async () => {
    const files: Record<string, string> = {
      'partial.json': JSON.stringify(runFile([combinationRun('default'), combinationRun('op-type')])),
    };
    const { io, logs } = fakeIo(files);

    const exitCode = await runRenderReport(['--input', 'partial.json'], io);

    expect(exitCode).not.toBe(0);
    expect(logs.some((line) => /faltan combinaciones/.test(line))).toBe(true);
  });

  it('con --baseline, renderiza el diff antes → después para la misma combinación y escribe el resultado en --out', async () => {
    const currentFiles: Record<string, string> = {};
    const baselineFiles: Record<string, string> = {};
    for (const id of BENCH_COMBINATION_IDS) {
      currentFiles[`current-${id}.json`] = JSON.stringify(runFile([combinationRun(id, id === 'default' ? { p95Ms: 120 } : {})]));
      baselineFiles[`baseline-${id}.json`] = JSON.stringify(runFile([combinationRun(id, id === 'default' ? { p95Ms: 900 } : {})]));
    }
    const { io, written } = fakeIo({ ...currentFiles, ...baselineFiles });

    const exitCode = await runRenderReport(
      [
        ...BENCH_COMBINATION_IDS.flatMap((id) => ['--input', `current-${id}.json`]),
        ...BENCH_COMBINATION_IDS.flatMap((id) => ['--baseline', `baseline-${id}.json`]),
        '--out',
        'report.md',
      ],
      io
    );

    expect(exitCode).toBe(0);
    expect(written['report.md']).toContain('900');
    expect(written['report.md']).toContain('120');
  });

  it('sin --out, escribe el informe con io.log en lugar de io.writeFile', async () => {
    const files: Record<string, string> = {};
    for (const id of BENCH_COMBINATION_IDS) {
      files[`${id}.json`] = JSON.stringify(runFile([combinationRun(id)]));
    }
    const { io, logs, written } = fakeIo(files);

    const exitCode = await runRenderReport(BENCH_COMBINATION_IDS.flatMap((id) => ['--input', `${id}.json`]), io);

    expect(exitCode).toBe(0);
    expect(Object.keys(written)).toHaveLength(0);
    expect(logs.some((line) => line.includes('| default |'))).toBe(true);
  });
});

// ROADMAP 2.4 (search-indexing-performance) — render-bench-report.ts.
// CORRECCIÓN (validador, hallazgo CRÍTICO "the spec's before/after report
// cannot be produced"): ninguna CLI conectaba `mergeRuns`/`renderReport`
// (`src/bench/report.ts`, fase 2, tareas 2.5/2.6 — ya implementados y
// testeados como funciones puras) con ficheros reales de `.bench/`. Este
// script es el shell FINO que faltaba: parsea SU PROPIO esquema de
// argumentos (no reutiliza `bench-options.ts`, porque no valida ninguna
// base de datos ni credencial — solo lee ficheros JSON ya escritos por
// `bench-search.ts`), lee cada fichero de `--input`/`--baseline`, valida su
// forma con `BenchRunSchema`, fusiona con `mergeRuns` (rechaza id duplicado
// o ausente con un error nombrado) y renderiza con `renderReport`. NUNCA
// abre conexión a base de datos. Mismo patrón `argv/io` que
// `scripts/bench-search.ts`, pero sin `env` porque no lee ninguna variable
// de entorno.
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { BenchRunSchema, mergeRuns, renderReport } from '../src/bench/report.js';
import type { BenchCombinationRun, BenchRun } from '../src/bench/report.js';

export class RenderReportOptionsError extends Error {}

export interface RenderReportOptions {
  readonly input: readonly string[];
  readonly baseline: readonly string[];
  readonly out: string | undefined;
}

// Solo `--input` es obligatorio (al menos un fichero); `--baseline` es
// opcional — sin línea base, `renderReport` no dibuja la columna "antes".
const renderReportRawSchema = z.strictObject({
  input: z.array(z.string().min(1)).min(1),
  baseline: z.array(z.string().min(1)),
  out: z.string().min(1).optional(),
});

export function parseRenderReportArgs(argv: readonly string[]): RenderReportOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        input: { type: 'string', multiple: true },
        baseline: { type: 'string', multiple: true },
        out: { type: 'string' },
      },
    });
  } catch (error) {
    throw new RenderReportOptionsError(error instanceof Error ? error.message : String(error));
  }

  const rawValues = parsed.values as {
    input?: readonly string[];
    baseline?: readonly string[];
    out?: string;
  };

  const result = renderReportRawSchema.safeParse({
    input: rawValues.input ?? [],
    baseline: rawValues.baseline ?? [],
    out: rawValues.out,
  });

  if (!result.success) {
    const issue = result.error.issues[0];
    const flagPath = issue?.path[0];
    const flag = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new RenderReportOptionsError(`${flag} inválido o ausente: ${issue?.message ?? 'sin detalle'}.`);
  }

  return { input: result.data.input, baseline: result.data.baseline, out: result.data.out };
}

export interface RenderReportIo {
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  log(line: string): void;
}

async function readRuns(io: RenderReportIo, paths: readonly string[]): Promise<readonly BenchRun[]> {
  const runs: BenchRun[] = [];
  for (const path of paths) {
    const raw = await io.readFile(path);
    runs.push(BenchRunSchema.parse(JSON.parse(raw) as unknown));
  }
  return runs;
}

export async function runRenderReport(argv: readonly string[], io: RenderReportIo): Promise<number> {
  let options: RenderReportOptions;
  try {
    options = parseRenderReportArgs(argv);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  let current: readonly BenchCombinationRun[];
  let baseline: readonly BenchCombinationRun[] | undefined;
  try {
    current = mergeRuns(await readRuns(io, options.input));
    baseline = options.baseline.length > 0 ? mergeRuns(await readRuns(io, options.baseline)) : undefined;
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'No se pudo leer o fusionar los ficheros de tanda.');
    return 3;
  }

  const markdown = renderReport(current, baseline);
  if (options.out !== undefined) {
    await io.writeFile(options.out, `${markdown}\n`);
    io.log(`render-bench-report: informe escrito en ${options.out}`);
  } else {
    io.log(markdown);
  }
  return 0;
}

export async function main(): Promise<void> {
  const io: RenderReportIo = {
    readFile: (path: string): Promise<string> => readFileAsync(path, 'utf8'),
    writeFile: (path: string, text: string): Promise<void> => writeFileAsync(path, text, 'utf8'),
    log: (line: string): void => {
      console.log(line);
    },
  };
  process.exitCode = await runRenderReport(process.argv.slice(2), io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/bench-search.ts y scripts/generate-search-corpus.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

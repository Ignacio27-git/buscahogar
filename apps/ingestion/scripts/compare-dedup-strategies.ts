// ROADMAP 2.2 — comando de CLI para comparar rule-based y la estrategia
// probabilística sobre el corpus etiquetado (D6). A diferencia de
// calibrate-blocking.ts (paso 1.8, read-only), este comando NO abre ninguna
// conexión a base de datos ni lee ninguna variable de entorno: el corpus
// vive en memoria (`@buscahogar/core`), así que `runComparison` es
// síncrona — cero peticiones de red, cero cuota, ejecutable sin `.env`
// (spec "No Database, Network, or Environment Dependency"). La ÚNICA I/O es
// la lectura local de `hashes.evaluation.json` (ROADMAP 2.3, Phase 4) —
// fichero committeado, sin red ni variables de entorno de por medio.
//
// ROADMAP 2.3 (Phase 4, spec "Four Evaluator Rows"): 4 filas, en este orden
// — rule-based estructurado-solo, rule-based+image, Fellegi-Sunter
// estructurado-solo, Fellegi-Sunter+image. Las dos filas estructuradas-solo
// puntúan SIEMPRE sobre `dedupCorpus` sin tocar (nunca `withCorpusImages`),
// exactamente como en ROADMAP 2.2 — es la única forma de garantizar
// "byte-idéntico a 2.2" sin depender de que la señal de imagen sea neutra
// por construcción.
//
// Sin test dedicado para `main()`, mismo precedente que calibrate-blocking.ts
// y scripts/sweep-zone.ts: es el shell de orquestación de módulos que YA
// están testeados por separado (options, grid, report, render — cada uno
// con su propia suite). `runComparison` SÍ está cubierta directamente
// (strategy-comparison-cli.test.ts) con un `CliIo` falso.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createImageEvaluators,
  dedupCorpus,
  evaluateStrategy,
  PROBABILISTIC_EVALUATOR,
  RULE_BASED_EVALUATOR,
  withCorpusImages,
} from '@buscahogar/core';
import type { StrategyEvaluation } from '@buscahogar/core';

import { loadImageHashLookup } from '../src/image-hash/loader.js';
import { expandBandGrid } from '../src/strategy-comparison/grid.js';
import { parseComparisonArgs } from '../src/strategy-comparison/options.js';
import { buildComparisonReport } from '../src/strategy-comparison/report.js';
import { renderCsv, renderJson, renderMarkdown } from '../src/strategy-comparison/render.js';

export interface CliIo {
  log(line: string): void;
  writeFile(path: string, text: string): void;
}

const HASHES_EVALUATION_PATH = fileURLToPath(
  new URL('../test/fixtures/images/hashes.evaluation.json', import.meta.url)
);

export function runComparison(argv: readonly string[], io: CliIo): number {
  let grid: ReturnType<typeof expandBandGrid>;
  let format: 'markdown' | 'json' | 'csv';
  let output: string | undefined;
  try {
    const options = parseComparisonArgs(argv);
    grid = expandBandGrid(options);
    format = options.format;
    output = options.output;
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  const lookup = loadImageHashLookup(JSON.parse(readFileSync(HASHES_EVALUATION_PATH, 'utf8')));
  const { ruleBasedWithImage, probabilisticWithImage } = createImageEvaluators(lookup);
  const corpusWithImages = withCorpusImages(dedupCorpus);

  const strategies: StrategyEvaluation[] = [
    evaluateStrategy(dedupCorpus, RULE_BASED_EVALUATOR, grid.thresholds),
    evaluateStrategy(corpusWithImages, ruleBasedWithImage, grid.thresholds),
    evaluateStrategy(dedupCorpus, PROBABILISTIC_EVALUATOR, grid.thresholds),
    evaluateStrategy(corpusWithImages, probabilisticWithImage, grid.thresholds),
  ];
  const report = buildComparisonReport(grid, strategies);

  const rendered = format === 'markdown' ? renderMarkdown(report) : format === 'json' ? renderJson(report) : renderCsv(report);

  if (output === undefined) {
    io.log(rendered);
  } else {
    io.writeFile(output, rendered);
  }

  return 0;
}

export function main(): void {
  const io: CliIo = {
    log: (line: string): void => {
      console.log(line);
    },
    writeFile: (path: string, text: string): void => {
      writeFileSync(path, text, 'utf8');
    },
  };

  process.exitCode = runComparison(process.argv.slice(2), io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts y scripts/sweep-zone.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

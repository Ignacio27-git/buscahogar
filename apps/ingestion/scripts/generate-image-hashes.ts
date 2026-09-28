// generate-image-hashes (ROADMAP 2.3, decisión 096/098) — CLI que calcula
// `hashes.{calibration,evaluation}.json` a partir de las fotos base
// committeadas: `--set calibration` hashea las 6 bases de calibración
// (`provenance.json`, `set==='calibration'`) contra sí mismas + los 7
// transforms de `transforms.ts` (original incluido); `--set evaluation`
// resuelve cada ref de `IMAGE_MANIFEST` (base o placeholder generado en
// memoria) y aplica su transform si tiene uno. Solo I/O local de ficheros —
// cero red, cero base de datos (spec "Tests run with zero network calls" se
// verifica en `image-hash-network.test.ts`, no aquí, pero el mismo criterio
// gobierna este script).
//
// Tarea 3.7: esta invocación SOLO se ejecuta con `--set calibration` — D8
// prohíbe generar `hashes.evaluation.json` antes de que el umbral T esté
// calibrado. La rama `--set evaluation` está implementada (el script cubre
// ambos modos, como pide el diseño), pero no se invoca hasta la tarea 4.1
// (Phase 4, fuera de alcance de este lote).
//
// Sin test dedicado para `main()`/el shell de CLI, mismo precedente que
// scripts/calibrate-blocking.ts y scripts/compare-dedup-strategies.ts: este
// fichero orquesta módulos que YA están testeados por separado (manifest.ts,
// transforms.ts, pipeline.ts, hash-table.schema.ts, provenance.schema.ts).
// El análisis de argumentos es un único flag obligatorio (`--set`),
// ejercitado end-to-end por la ejecución real de la tarea 3.10.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import sharp from 'sharp';
import { z } from 'zod';

import type { ImageHashEntry } from '@buscahogar/core';

import { IMAGE_HASH_ALGORITHM, imageHashTableSchema } from '../src/image-hash/hash-table.schema.js';
import type { ImageHashTable } from '../src/image-hash/hash-table.schema.js';
import { IMAGE_MANIFEST } from '../src/image-hash/manifest.js';
import { CROP_MARGIN_RATIO, hashImage, LOW_ENTROPY_STDDEV } from '../src/image-hash/pipeline.js';
import { imageProvenanceSchema } from '../src/image-hash/provenance.schema.js';
import { applyTransform, IMAGE_TRANSFORM_KINDS } from '../src/image-hash/transforms.js';

export class GenerateHashesOptionsError extends Error {}

const SET_SCHEMA = z.enum(['calibration', 'evaluation']);
export type ImageHashSet = z.infer<typeof SET_SCHEMA>;

export function parseGenerateOptions(argv: readonly string[]): { readonly set: ImageHashSet } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: [...argv], strict: true, options: { set: { type: 'string' } } });
  } catch (error) {
    throw new GenerateHashesOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = SET_SCHEMA.safeParse(parsed.values.set);
  if (!result.success) {
    throw new GenerateHashesOptionsError('--set es obligatorio: "calibration" o "evaluation".');
  }
  return { set: result.data };
}

const FIXTURES_DIR = fileURLToPath(new URL('../test/fixtures/images/', import.meta.url));
const BASES_DIR = `${FIXTURES_DIR}bases/`;
const PLACEHOLDER_SIZE = 64;

function baseIdOf(file: string): string {
  return file.replace(/\.jpg$/, '');
}

async function hashPairs(pairs: readonly (readonly [string, Buffer])[]): Promise<Record<string, ImageHashEntry>> {
  const entries: Record<string, ImageHashEntry> = {};
  for (const [ref, buf] of pairs) {
    entries[ref] = await hashImage(buf);
  }
  return entries;
}

// Calibración (decisión 097): las 6 bases de `provenance.json` con
// `set==='calibration'`, cada una original + sus 7 transforms — 48 entradas
// en total, la materia prima de la que `calibration.ts` deriva los 48 pares
// positivos y los 15 negativos cruzados.
async function buildCalibrationEntries(): Promise<Record<string, ImageHashEntry>> {
  const provenance = imageProvenanceSchema.parse(
    JSON.parse(readFileSync(`${FIXTURES_DIR}provenance.json`, 'utf8'))
  );
  const calibrationBases = provenance.filter((entry) => entry.set === 'calibration');

  const pairs: Array<readonly [string, Buffer]> = [];
  for (const base of calibrationBases) {
    const original = readFileSync(`${BASES_DIR}${base.file}`);
    const id = baseIdOf(base.file);
    pairs.push([`fixture-image:calib/${id}-original`, original]);
    for (const kind of IMAGE_TRANSFORM_KINDS) {
      const transformed = await applyTransform(original, { kind });
      pairs.push([`fixture-image:calib/${id}-${kind}`, transformed]);
    }
  }
  return hashPairs(pairs);
}

async function placeholderBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: PLACEHOLDER_SIZE,
      height: PLACEHOLDER_SIZE,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

// Evaluación (decisión 098, Phase 4): resuelve cada ref de IMAGE_MANIFEST —
// no invocado por esta tarea (D8), implementado para que el script cubra
// ambos `--set` desde ya.
async function buildEvaluationEntries(): Promise<Record<string, ImageHashEntry>> {
  const pairs: Array<readonly [string, Buffer]> = [];
  for (const [ref, entry] of Object.entries(IMAGE_MANIFEST)) {
    const original =
      entry.base === 'placeholder' ? await placeholderBuffer() : readFileSync(`${BASES_DIR}${entry.base}`);
    const buf = entry.transform === undefined ? original : await applyTransform(original, { kind: entry.transform });
    pairs.push([ref, buf]);
  }
  return hashPairs(pairs);
}

function sortedEntries(entries: Readonly<Record<string, ImageHashEntry>>): Record<string, ImageHashEntry> {
  const sorted: Record<string, ImageHashEntry> = {};
  for (const key of Object.keys(entries).sort()) {
    sorted[key] = entries[key] as ImageHashEntry;
  }
  return sorted;
}

export async function buildHashTable(set: ImageHashSet): Promise<ImageHashTable> {
  const entries = set === 'calibration' ? await buildCalibrationEntries() : await buildEvaluationEntries();

  return imageHashTableSchema.parse({
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    algorithm: IMAGE_HASH_ALGORITHM,
    cropMargin: CROP_MARGIN_RATIO,
    lowEntropyStddev: LOW_ENTROPY_STDDEV,
    entries: sortedEntries(entries),
  });
}

export function outputPathFor(set: ImageHashSet): string {
  return `${FIXTURES_DIR}hashes.${set}.json`;
}

export interface GenerateHashesIo {
  log(line: string): void;
  writeFile(path: string, text: string): void;
}

export async function runGenerateHashes(argv: readonly string[], io: GenerateHashesIo): Promise<number> {
  let set: ImageHashSet;
  try {
    ({ set } = parseGenerateOptions(argv));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  const table = await buildHashTable(set);
  const path = outputPathFor(set);
  io.writeFile(path, `${JSON.stringify(table, null, 2)}\n`);
  io.log(`Escritas ${String(Object.keys(table.entries).length)} entradas en ${path}`);
  return 0;
}

export async function main(): Promise<void> {
  const io: GenerateHashesIo = {
    log: (line: string): void => {
      console.log(line);
    },
    writeFile: (path: string, text: string): void => {
      writeFileSync(path, text, 'utf8');
    },
  };

  process.exitCode = await runGenerateHashes(process.argv.slice(2), io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts y scripts/compare-dedup-strategies.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

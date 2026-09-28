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
// Tarea 3.7 (Phase 3): solo se invocó con `--set calibration` — D8 prohíbe
// generar `hashes.evaluation.json` antes de que el umbral T esté calibrado.
// Tarea 4.1 (Phase 4): con T ya fijado (Phase 3, `IMAGE_HAMMING_THRESHOLD`),
// `--set evaluation` se invocó para producir el `hashes.evaluation.json`
// committeado que consume `compare-dedup-strategies.ts`.
//
// `diffHashTables`/`formatMismatchReport` (tarea 4.19/4.20): diagnóstico de
// discrepancia expuesto para quien necesite comprobar que una regeneración
// reproduce el fichero committeado (image-hash-determinism.test.ts) — NO se
// invoca desde `runGenerateHashes`, que sigue siendo un generador puro
// (siempre sobrescribe), no un comprobador; cambiar ese comportamiento
// tocaría la ejecución real de la tarea 3.7 ya verificada y committeada.
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
import { hammingDistance64 } from '@buscahogar/core';

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

// diffHashTables/formatMismatchReport (ROADMAP 2.3, tarea 4.19/4.20, spec
// "Fixture hashes are reproducible"): diagnóstico para cuando una
// regeneración NO reproduce el fichero committeado — recorre la UNIÓN de
// refs de ambas tablas (una ref presente en un solo lado también es un
// mismatch, `hash`/`kind` incluidos) y, cuando los dos lados tienen un hash
// real (`kind: 'hashed'`), añade la distancia Hamming entre ambos para que
// el mismatch se pueda juzgar por magnitud, no solo por "distinto/igual".
export interface HashMismatch {
  readonly ref: string;
  readonly committedHash: string | undefined;
  readonly regeneratedHash: string | undefined;
  readonly distance: number | null;
}

function hashOf(entry: ImageHashEntry | undefined): string | undefined {
  return entry?.kind === 'hashed' ? entry.hash : undefined;
}

export function diffHashTables(committed: ImageHashTable, regenerated: ImageHashTable): readonly HashMismatch[] {
  const refs = new Set([...Object.keys(committed.entries), ...Object.keys(regenerated.entries)]);
  const mismatches: HashMismatch[] = [];

  for (const ref of refs) {
    const committedEntry = committed.entries[ref];
    const regeneratedEntry = regenerated.entries[ref];
    if (JSON.stringify(committedEntry) === JSON.stringify(regeneratedEntry)) continue;

    const committedHash = hashOf(committedEntry);
    const regeneratedHash = hashOf(regeneratedEntry);
    mismatches.push({
      ref,
      committedHash,
      regeneratedHash,
      distance: committedHash === undefined || regeneratedHash === undefined ? null : hammingDistance64(committedHash, regeneratedHash),
    });
  }

  // Orden estable por ref — un diagnóstico que reordena entre ejecuciones es
  // tan molesto de leer en revisión como uno que no reporta nada.
  return mismatches.sort((a, b) => a.ref.localeCompare(b.ref));
}

export function formatMismatchReport(
  committed: ImageHashTable,
  regenerated: ImageHashTable,
  mismatches: readonly HashMismatch[]
): string {
  const lines = [
    `sharp: committed=${committed.sharp} regenerated=${regenerated.sharp}`,
    `libvips: committed=${committed.libvips} regenerated=${regenerated.libvips}`,
    `${String(mismatches.length)} discrepancia(s):`,
    ...mismatches.map(
      (m) =>
        `  ${m.ref}: committed=${m.committedHash ?? 'n/a'} regenerated=${m.regeneratedHash ?? 'n/a'} ` +
        `distance=${m.distance === null ? 'n/a' : String(m.distance)}`
    ),
  ];
  return lines.join('\n');
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

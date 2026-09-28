// image-hash-determinism (ROADMAP 2.3, tarea 4.19/4.20, spec "Fixture
// hashes are reproducible"): re-ejecutar `generate-image-hashes --set
// evaluation` sobre las fixtures committeadas debe reproducir EXACTAMENTE
// `hashes.evaluation.json` — mismas 47 entradas, mismo hash, mismo
// `lowEntropy` para cada ref. `diffHashTables`/`formatMismatchReport` son el
// diagnóstico de discrepancia que el propio diseño pide ("mismatch report
// prints per-ref distance + versions") — probados aquí con tablas
// sintéticas, sin depender de que una regeneración real llegue a fallar
// nunca.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildHashTable, diffHashTables, formatMismatchReport, outputPathFor } from '../scripts/generate-image-hashes.js';
import { imageHashTableSchema } from '../src/image-hash/hash-table.schema.js';

const COMMITTED_EVALUATION_PATH = fileURLToPath(
  new URL('fixtures/images/hashes.evaluation.json', import.meta.url)
);

describe('regenerar hashes.evaluation.json reproduce exactamente el fichero committeado (spec "Fixture hashes are reproducible")', () => {
  it('outputPathFor("evaluation") apunta al fichero committeado real', () => {
    expect(outputPathFor('evaluation')).toBe(COMMITTED_EVALUATION_PATH);
  });

  it('buildHashTable("evaluation") regenera las 47 entradas, todas idénticas a las committeadas', async () => {
    const committed = imageHashTableSchema.parse(JSON.parse(readFileSync(COMMITTED_EVALUATION_PATH, 'utf8')));
    const regenerated = await buildHashTable('evaluation');

    expect(Object.keys(regenerated.entries)).toHaveLength(Object.keys(committed.entries).length);

    const mismatches = diffHashTables(committed, regenerated);
    expect(mismatches).toEqual([]);
    expect(regenerated.entries).toEqual(committed.entries);
  }, 30_000);
});

describe('diffHashTables/formatMismatchReport — diagnóstico de discrepancia (tabla sintética)', () => {
  const committed = imageHashTableSchema.parse({
    sharp: '0.34.2',
    libvips: '8.16.1',
    algorithm: 'dct-phash-64',
    cropMargin: 0.05,
    lowEntropyStddev: 10,
    entries: {
      'fixture-image:eval/x-a': { kind: 'hashed', hash: '0000000000000000', lowEntropy: false },
      'fixture-image:eval/x-b': { kind: 'hashed', hash: 'ffffffffffffffff', lowEntropy: false },
    },
  });

  it('sin diferencias, diffHashTables devuelve un array vacío', () => {
    expect(diffHashTables(committed, committed)).toEqual([]);
  });

  it('un hash distinto entre committed y regenerated aparece como mismatch con su distancia Hamming', () => {
    const regenerated = imageHashTableSchema.parse({
      ...committed,
      sharp: '0.34.3',
      entries: {
        ...committed.entries,
        // Difiere en exactamente 1 bit del valor committeado.
        'fixture-image:eval/x-a': { kind: 'hashed', hash: '0000000000000001', lowEntropy: false },
      },
    });

    const mismatches = diffHashTables(committed, regenerated);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toEqual({
      ref: 'fixture-image:eval/x-a',
      committedHash: '0000000000000000',
      regeneratedHash: '0000000000000001',
      distance: 1,
    });

    const report = formatMismatchReport(committed, regenerated, mismatches);
    expect(report).toContain('fixture-image:eval/x-a');
    expect(report).toContain('distance=1');
    expect(report).toContain('0.34.2');
    expect(report).toContain('0.34.3');
    expect(report).toContain('8.16.1');
  });

  it('una ref presente en un lado y ausente en el otro también es un mismatch, con distance null', () => {
    const regenerated = imageHashTableSchema.parse({
      ...committed,
      entries: { 'fixture-image:eval/x-a': committed.entries['fixture-image:eval/x-a'] },
    });

    const mismatches = diffHashTables(committed, regenerated);

    expect(mismatches).toEqual([
      { ref: 'fixture-image:eval/x-b', committedHash: 'ffffffffffffffff', regeneratedHash: undefined, distance: null },
    ]);
  });
});

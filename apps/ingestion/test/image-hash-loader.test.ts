// loadImageHashLookup (ROADMAP 2.3, Phase 4): carga una `ImageHashTable` ya
// parseada (JSON.parse de hashes.evaluation.json) a través de
// `imageHashTableSchema` y construye un `ImageHashLookup` vía
// `createImageHashLookup`, keyed por las refs `fixture-image:` de
// `table.entries`. Toma el objeto YA parseado, no una ruta — mismo
// precedente que `runCalibrateThreshold` (Phase 3): testable sin tocar
// ficheros reales; el wiring de `readFileSync` real vive en el CLI
// (compare-dedup-strategies.ts, tarea 4.18), no aquí.
import { describe, expect, it } from 'vitest';

import { makeListing } from '@buscahogar/core';

import { loadImageHashLookup } from '../src/image-hash/loader.js';

const HASHED_A = { kind: 'hashed', hash: '00000000000000ff', lowEntropy: false } as const;

const VALID_TABLE = {
  sharp: '0.34.2',
  libvips: '8.16.1',
  algorithm: 'dct-phash-64',
  cropMargin: 0.05,
  lowEntropyStddev: 10,
  entries: {
    'fixture-image:eval/tp-1-mismo-anuncio-cerca-a': HASHED_A,
  },
};

describe('loadImageHashLookup (ROADMAP 2.3, Phase 4)', () => {
  it('valida la tabla con imageHashTableSchema y resuelve una ref conocida a su ImageHashEntry', () => {
    const lookup = loadImageHashLookup(VALID_TABLE);
    const listing = makeListing({ thumbnailUrl: 'fixture-image:eval/tp-1-mismo-anuncio-cerca-a' });

    expect(lookup(listing)).toEqual(HASHED_A);
  });

  it('una ref desconocida resuelve undefined, nunca lanza', () => {
    const lookup = loadImageHashLookup(VALID_TABLE);
    const listing = makeListing({ thumbnailUrl: 'fixture-image:eval/no-existe-a' });

    expect(lookup(listing)).toBeUndefined();
  });

  it('una tabla mal formada (algoritmo desconocido) lanza vía el propio schema, no un error genérico de parseo', () => {
    const malformed = { ...VALID_TABLE, algorithm: 'md5' };

    expect(() => loadImageHashLookup(malformed)).toThrow();
  });
});

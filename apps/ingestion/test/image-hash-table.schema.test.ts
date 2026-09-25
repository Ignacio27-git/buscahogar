// ROADMAP 2.3 — imageHashTableSchema (decisión 096): forma de
// hashes.{calibration,evaluation}.json — cabecera de procedencia (sharp,
// libvips, algorithm, cropMargin, lowEntropyStddev) + mapa de entradas con
// claves ORDENADAS ascendentemente (sorted-key entry map, para que el diff
// de un fichero regenerado sea legible en revisión).
import { describe, expect, it } from 'vitest';

import { IMAGE_HASH_ALGORITHM, imageHashTableSchema } from '../src/image-hash/hash-table.schema.js';

function validHeader(): Record<string, unknown> {
  return {
    sharp: '0.34.2',
    libvips: '8.16.1',
    algorithm: IMAGE_HASH_ALGORITHM,
    cropMargin: 0.05,
    lowEntropyStddev: 10,
  };
}

describe('imageHashTableSchema (ROADMAP 2.3, decisión 096)', () => {
  it('acepta una cabecera bien formada con un mapa de entradas de claves ordenadas', () => {
    const result = imageHashTableSchema.safeParse({
      ...validHeader(),
      entries: {
        'fixture-image:eval/a-a': { kind: 'hashed', hash: '0000000000000000', lowEntropy: false },
        'fixture-image:eval/b-a': { kind: 'unreadable' },
      },
    });

    expect(result.success).toBe(true);
  });

  it('acepta un mapa de entradas vacío', () => {
    const result = imageHashTableSchema.safeParse({ ...validHeader(), entries: {} });

    expect(result.success).toBe(true);
  });

  it('rechaza claves fuera de orden ascendente', () => {
    const result = imageHashTableSchema.safeParse({
      ...validHeader(),
      entries: {
        'fixture-image:eval/b-a': { kind: 'unreadable' },
        'fixture-image:eval/a-a': { kind: 'hashed', hash: '0000000000000000', lowEntropy: false },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rechaza un algorithm desconocido', () => {
    const result = imageHashTableSchema.safeParse({
      ...validHeader(),
      algorithm: 'phash-legacy',
      entries: {},
    });

    expect(result.success).toBe(false);
  });

  it('rechaza una entrada malformada (hash con longitud incorrecta)', () => {
    const result = imageHashTableSchema.safeParse({
      ...validHeader(),
      entries: {
        'fixture-image:eval/a-a': { kind: 'hashed', hash: 'demasiado-corto', lowEntropy: false },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rechaza una entrada malformada (kind desconocido)', () => {
    const result = imageHashTableSchema.safeParse({
      ...validHeader(),
      entries: { 'fixture-image:eval/a-a': { kind: 'partial' } },
    });

    expect(result.success).toBe(false);
  });

  it('rechaza una clave extra en la cabecera (z.strictObject)', () => {
    const result = imageHashTableSchema.safeParse({ ...validHeader(), entries: {}, extra: true });

    expect(result.success).toBe(false);
  });
});

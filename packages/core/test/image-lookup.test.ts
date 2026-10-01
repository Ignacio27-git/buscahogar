// ROADMAP 2.3 — createImageHashLookup (decisión 093): construye un
// ImageHashLookup a partir de una tabla indexada por `thumbnailUrl`. Nunca
// lanza: una clave ausente resuelve a `undefined`, que compareImageHashes ya
// interpreta como `neutral/missing`.
import { describe, expect, it } from 'vitest';

import type { ImageHashEntry } from '../src/strategies/image/compare.js';
import { createImageHashLookup } from '../src/strategies/image/lookup.js';
import { makeListing } from './test-helpers.js';

describe('createImageHashLookup (ROADMAP 2.3, decisión 093)', () => {
  it('resuelve un listing a su ImageHashEntry a través de thumbnailUrl', () => {
    const entry: ImageHashEntry = { kind: 'hashed', hash: '0000000000000000', lowEntropy: false };
    const lookup = createImageHashLookup({ 'https://example.test/thumb-1.jpg': entry });

    const listing = makeListing({ thumbnailUrl: 'https://example.test/thumb-1.jpg' });

    expect(lookup(listing)).toBe(entry);
  });

  it('devuelve undefined (nunca lanza) cuando la clave está ausente de la tabla', () => {
    const lookup = createImageHashLookup({});

    expect(
      lookup(makeListing({ thumbnailUrl: 'https://example.test/no-esta-en-la-tabla.jpg' }))
    ).toBeUndefined();
  });

  it('devuelve undefined cuando el propio listing no tiene thumbnailUrl', () => {
    const entry: ImageHashEntry = { kind: 'hashed', hash: '0000000000000000', lowEntropy: false };
    const lookup = createImageHashLookup({ 'https://example.test/thumb-1.jpg': entry });

    expect(lookup(makeListing({ thumbnailUrl: undefined }))).toBeUndefined();
  });
});

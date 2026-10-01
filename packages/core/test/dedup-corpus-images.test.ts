// ROADMAP 2.3 — withCorpusImages/IMAGE_REFS (decisión 093, spec "Corpus
// Carries Image References Without Changing Truth"): adjunta refs
// no-fetchables `fixture-image:eval/<pairId>-<a|b>` a `thumbnailUrl` sobre
// COPIAS del corpus, sin tocar `dedup-corpus.ts` ni su `truth`. `md-3` lado
// b es la única excepción deliberada (spec "Deliberately missing reference
// resolves to neutral/missing") — ningún otro lado del corpus la comparte.
import { describe, expect, it } from 'vitest';

import { dedupCorpus } from '../src/evaluation/dedup-corpus.js';
import { compareImageHashes } from '../src/strategies/image/compare.js';
import { createImageHashLookup } from '../src/strategies/image/lookup.js';
import { IMAGE_REFS, withCorpusImages } from '../src/evaluation/dedup-corpus-images.js';

describe('IMAGE_REFS/withCorpusImages (ROADMAP 2.3, decisión 093)', () => {
  it('IMAGE_REFS cubre las 24 parejas del corpus, con el lado b de md-3 ausente', () => {
    expect(dedupCorpus).toHaveLength(24);
    expect(Object.keys(IMAGE_REFS)).toHaveLength(24);

    for (const entry of dedupCorpus) {
      const refs = IMAGE_REFS[entry.id];
      expect(refs).toBeDefined();
      expect(refs?.a).toBe(`fixture-image:eval/${entry.id}-a`);
      if (entry.id === 'md-3-direccion-ausente-ambos-lados') {
        expect(refs?.b).toBeUndefined();
      } else {
        expect(refs?.b).toBe(`fixture-image:eval/${entry.id}-b`);
      }
    }
  });

  it('withCorpusImages devuelve COPIAS: el corpus original (dedup-corpus.ts) no se muta', () => {
    const originalFirstA = dedupCorpus[0]?.a;
    withCorpusImages(dedupCorpus);

    expect(dedupCorpus[0]?.a).toBe(originalFirstA);
    expect(dedupCorpus[0]?.a.thumbnailUrl).toBeUndefined();
  });

  it('withCorpusImages adjunta thumbnailUrl a cada lado presente, sin tocar truth/expected/rationale/id', () => {
    const withImages = withCorpusImages(dedupCorpus);
    expect(withImages).toHaveLength(24);

    for (let i = 0; i < withImages.length; i += 1) {
      const original = dedupCorpus[i];
      const withImage = withImages[i];
      expect(original).toBeDefined();
      expect(withImage).toBeDefined();
      if (original === undefined || withImage === undefined) continue;

      expect(withImage.id).toBe(original.id);
      expect(withImage.truth).toBe(original.truth);
      expect(withImage.expected).toBe(original.expected);
      expect(withImage.rationale).toBe(original.rationale);
      expect(withImage.a.thumbnailUrl).toBe(`fixture-image:eval/${original.id}-a`);

      if (original.id === 'md-3-direccion-ausente-ambos-lados') {
        expect(withImage.b.thumbnailUrl).toBeUndefined();
      } else {
        expect(withImage.b.thumbnailUrl).toBe(`fixture-image:eval/${original.id}-b`);
      }
    }
  });

  it('md-3 lado b, sin referencia, resuelve neutral/missing cuando se puntúa a través del lookup (spec)', () => {
    const withImages = withCorpusImages(dedupCorpus);
    const md3 = withImages.find((entry) => entry.id === 'md-3-direccion-ausente-ambos-lados');
    expect(md3).toBeDefined();
    if (md3 === undefined) return;

    // Tabla vacía a propósito: el lado a SÍ tiene ref, pero ninguna entrada
    // hasheada para ella — igual de "no resuelve a nada útil" que el lado b
    // sin ref siquiera. compareImageHashes debe dar 'missing' en ambos casos.
    const lookup = createImageHashLookup({});
    const comparison = compareImageHashes(lookup(md3.a), lookup(md3.b), 8);

    expect(comparison.level).toBe('neutral');
    expect(comparison.reason).toBe('missing');
  });
});

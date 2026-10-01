// ROADMAP 2.3 — withImageSignal (spec "Decorator Preserves Wrapped Behaviour
// When Neutral", "Decorator Identity Distinct from Wrapped Strategy",
// "Image Signal Always Recorded in Breakdown"): decorador que envuelve una
// DedupStrategy sin alterar su cálculo estructurado.
import { describe, expect, it } from 'vitest';

import type { DedupStrategy } from '../src/contracts/dedup-strategy.js';
import { ruleBasedImageCombiner } from '../src/strategies/image/combiners.js';
import type { ImageHashEntry } from '../src/strategies/image/compare.js';
import { createImageHashLookup } from '../src/strategies/image/lookup.js';
import { withImageSignal } from '../src/strategies/image/with-image-signal.js';
import { ruleBasedDedupStrategy } from '../src/strategies/rule-based/strategy.js';
import type { SimilarityResult } from '../src/types/similarity.js';
import { makeListing } from './test-helpers.js';

const THUMB_A = 'https://example.test/a.jpg';
const THUMB_B = 'https://example.test/b.jpg';

describe('withImageSignal (ROADMAP 2.3)', () => {
  it('neutral: score numérico y cada entrada no-image del breakdown son Object.is-idénticos a base.score()', () => {
    // Doble de prueba que SIEMPRE devuelve el mismo objeto literal (a
    // diferencia de ruleBasedDedupStrategy, que construye un SignalScore
    // nuevo en cada llamada): así se aísla el comportamiento del DECORADOR
    // — reutiliza por referencia lo que `base.score()` le da, sin
    // reconstruir nada — de la falta de memoización de la estrategia real,
    // que haría fallar una comparación Object.is entre dos invocaciones
    // independientes de la misma estrategia sin decorar.
    const fixedResult: SimilarityResult = {
      score: 0.42,
      signals: {
        distance: { value: 1, weight: 25 },
        price: { value: 0.8, weight: 15 },
      },
    };
    const base: DedupStrategy = { name: 'stub-base', version: '0.0.0', score: () => fixedResult };

    const table: Record<string, ImageHashEntry> = {
      [THUMB_A]: { kind: 'unreadable' }, // fuerza neutral/unreadable
      [THUMB_B]: { kind: 'unreadable' },
    };
    const lookup = createImageHashLookup(table);
    const decorated = withImageSignal(base, {
      lookup,
      threshold: 8,
      combiner: ruleBasedImageCombiner,
    });

    const a = makeListing({ thumbnailUrl: THUMB_A });
    const b = makeListing({ thumbnailUrl: THUMB_B, priceCents: a.priceCents });

    const decoratedResult = decorated.score(a, b);

    expect(Object.is(decoratedResult.score, fixedResult.score)).toBe(true);
    for (const key of Object.keys(fixedResult.signals)) {
      expect(Object.is(decoratedResult.signals[key], fixedResult.signals[key])).toBe(true);
    }
  });

  it('name/version decorados difieren de los de la estrategia base', () => {
    const lookup = createImageHashLookup({});
    const decorated = withImageSignal(ruleBasedDedupStrategy, {
      lookup,
      threshold: 8,
      combiner: ruleBasedImageCombiner,
    });

    expect(decorated.name).not.toBe(ruleBasedDedupStrategy.name);
    expect(decorated.version).not.toBe(ruleBasedDedupStrategy.version);
  });

  it('la clave "image" del breakdown está SIEMPRE presente: caso strong', () => {
    const hash = '0000000000000000';
    const table: Record<string, ImageHashEntry> = {
      [THUMB_A]: { kind: 'hashed', hash, lowEntropy: false },
      [THUMB_B]: { kind: 'hashed', hash, lowEntropy: false },
    };
    const lookup = createImageHashLookup(table);
    const decorated = withImageSignal(ruleBasedDedupStrategy, {
      lookup,
      threshold: 8,
      combiner: ruleBasedImageCombiner,
    });

    const a = makeListing({ thumbnailUrl: THUMB_A });
    const b = makeListing({ thumbnailUrl: THUMB_B, priceCents: a.priceCents });

    const result = decorated.score(a, b);

    expect(result.signals['image']).toBeDefined();
    expect((result.signals['image'] as { value: number }).value).toBe(1);
  });

  it.each(['missing', 'unreadable', 'low-entropy', 'above-threshold'] as const)(
    'la clave "image" del breakdown está SIEMPRE presente: razón neutral %s',
    (expectedReason) => {
      let table: Record<string, ImageHashEntry>;
      if (expectedReason === 'missing') {
        table = {}; // ninguna referencia resuelve
      } else if (expectedReason === 'unreadable') {
        table = { [THUMB_A]: { kind: 'unreadable' }, [THUMB_B]: { kind: 'unreadable' } };
      } else if (expectedReason === 'low-entropy') {
        table = {
          [THUMB_A]: { kind: 'hashed', hash: '0000000000000000', lowEntropy: true },
          [THUMB_B]: { kind: 'hashed', hash: '0000000000000000', lowEntropy: false },
        };
      } else {
        table = {
          [THUMB_A]: { kind: 'hashed', hash: '0000000000000000', lowEntropy: false },
          [THUMB_B]: { kind: 'hashed', hash: 'ffffffffffffffff', lowEntropy: false },
        };
      }

      const lookup = createImageHashLookup(table);
      const decorated = withImageSignal(ruleBasedDedupStrategy, {
        lookup,
        threshold: 8,
        combiner: ruleBasedImageCombiner,
      });

      const a = makeListing({ thumbnailUrl: THUMB_A });
      const b = makeListing({ thumbnailUrl: THUMB_B, priceCents: a.priceCents });

      const result = decorated.score(a, b);

      expect(result.signals['image']).toMatchObject({ value: 0, weight: 0 });
      expect(result.signals['image']?.detail).toContain(`reason=${expectedReason}`);
    }
  );

  it('threshold fuera de [1,64] lanza RangeError', () => {
    const lookup = createImageHashLookup({});

    expect(() =>
      withImageSignal(ruleBasedDedupStrategy, {
        lookup,
        threshold: 0,
        combiner: ruleBasedImageCombiner,
      })
    ).toThrow(RangeError);
    expect(() =>
      withImageSignal(ruleBasedDedupStrategy, {
        lookup,
        threshold: 65,
        combiner: ruleBasedImageCombiner,
      })
    ).toThrow(RangeError);
    expect(() =>
      withImageSignal(ruleBasedDedupStrategy, {
        lookup,
        threshold: 8.5,
        combiner: ruleBasedImageCombiner,
      })
    ).toThrow(RangeError);
  });
});

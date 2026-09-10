import { describe, expect, it } from 'vitest';

import type { SignalBreakdown, SignalScore, SimilarityResult } from '../src/types/similarity.js';

// `SimilarityResult` es la evidencia no reconstruible del TFM (CLAUDE.md): debe
// exponer siempre la puntuación total Y el desglose por señal, nunca solo una
// de las dos. El rango de `score` queda deliberadamente sin acotar — se fija
// en ROADMAP 1.9, no aquí.
describe('SimilarityResult', () => {
  it('un literal con dos señales expone score y signals', () => {
    const result: SimilarityResult = {
      score: 0.82,
      signals: {
        address: { value: 1, weight: 0.4 },
        price: { value: 0.9, weight: 0.3, detail: '2% de diferencia' },
      },
    };

    expect(result.score).toBe(0.82);
    expect(result.signals.address).toEqual({ value: 1, weight: 0.4 });
  });

  it('un valor sin signals no compila como SimilarityResult', () => {
    // @ts-expect-error signals es un miembro obligatorio de SimilarityResult
    const invalid: SimilarityResult = { score: 0.82 };

    expect(invalid).toBeDefined();
  });

  it('añadir una nueva señal (p. ej. images) tipa contra el mismo SignalBreakdown sin editar el tipo', () => {
    const signalWithImages: SignalScore = { value: 0.6, weight: 0.2 };
    const signals: SignalBreakdown = {
      address: { value: 1, weight: 0.4 },
      images: signalWithImages,
    };

    expect(signals.images).toBe(signalWithImages);
  });

  it('bajo noUncheckedIndexedAccess, indexar SignalBreakdown produce SignalScore | undefined', () => {
    const signals: SignalBreakdown = { address: { value: 1, weight: 0.4 } };

    const maybeScore = signals['address'];
    // Sin este `?.`, noUncheckedIndexedAccess haría fallar el typecheck.
    expect(maybeScore?.value).toBe(1);
  });

  it('SignalScore admite un detail opcional', () => {
    const withDetail: SignalScore = { value: 1, weight: 1, detail: 'coincidencia exacta' };
    const withoutDetail: SignalScore = { value: 1, weight: 1 };

    expect(withDetail.detail).toBe('coincidencia exacta');
    expect(withoutDetail.detail).toBeUndefined();
  });

  it('SignalBreakdown es un registro abierto de claves de señal', () => {
    const signals: SignalBreakdown = {};

    expect(Object.keys(signals)).toHaveLength(0);
  });
});

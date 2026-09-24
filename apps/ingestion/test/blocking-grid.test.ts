// ROADMAP 1.8 — expandGrid (diseño D-C1, CLI-2): producto cartesiano de la
// rejilla de calibración. D4 fija una consulta por combinación — el tamaño
// de la rejilla ES el coste, así que un tope excedido RECHAZA (no trunca en
// silencio): una lista mal escrita no debe disparar cientos de consultas.
import { describe, expect, it } from 'vitest';

import { expandGrid, GridSizeError } from '../src/blocking/grid.js';

describe('expandGrid (CLI-2, D-C1)', () => {
  it('produce el producto cartesiano de N radios × M bandas × K tolerancias', () => {
    const combinations = expandGrid({
      radiusMeters: [150, 300],
      priceBandCents: [1_000_000],
      surfaceToleranceM2: [5, 10],
    });

    expect(combinations).toHaveLength(4);
    expect(combinations).toContainEqual({ radiusMeters: 150, priceBandCents: 1_000_000, surfaceToleranceM2: 5 });
    expect(combinations).toContainEqual({ radiusMeters: 150, priceBandCents: 1_000_000, surfaceToleranceM2: 10 });
    expect(combinations).toContainEqual({ radiusMeters: 300, priceBandCents: 1_000_000, surfaceToleranceM2: 5 });
    expect(combinations).toContainEqual({ radiusMeters: 300, priceBandCents: 1_000_000, surfaceToleranceM2: 10 });
  });

  it('cada tupla es validada por blockingThresholdsSchema (un radio no positivo se rechaza)', () => {
    expect(() =>
      expandGrid({
        radiusMeters: [0],
        priceBandCents: [1_000_000],
        surfaceToleranceM2: [5],
      })
    ).toThrow();
  });

  it('una rejilla por encima de MAX_COMBINATIONS rechaza nombrando el conteo calculado', () => {
    const radiusMeters = Array.from({ length: 9 }, (_, i) => 100 + i);
    const priceBandCents = Array.from({ length: 9 }, (_, i) => 1_000_000 + i);
    // 9 * 9 = 81 > 64 (MAX_COMBINATIONS)
    expect(() =>
      expandGrid({ radiusMeters, priceBandCents, surfaceToleranceM2: [5] })
    ).toThrow(GridSizeError);
    expect(() =>
      expandGrid({ radiusMeters, priceBandCents, surfaceToleranceM2: [5] })
    ).toThrow(/81/);
  });
});

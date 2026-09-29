// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, ZRS-11/12) — techo
// del carril de refresco: `least(cap, floor(cap × fracción))`. Función pura,
// sin base de datos; la reserva SQL que lo aplica se prueba en
// `budget-ledger.test.ts`.
import { describe, expect, it } from 'vitest';

import { refreshLaneCeiling } from '../src/budget-ledger.js';

describe('refreshLaneCeiling — floor(cap × fracción), acotado por el tope', () => {
  it.each([
    [100, 0.2, 20],
    [500, 0.1, 50],
    [100, 0, 0],
    [100, 1, 100],
    [10, 0.25, 2],
  ])('cap %i, fracción %f -> techo %i', (cap, fraction, expected) => {
    expect(refreshLaneCeiling(cap, fraction)).toBe(expected);
  });

  it('nunca supera el tope aunque la fracción sea mayor que 1', () => {
    expect(refreshLaneCeiling(100, 1.5)).toBe(100);
  });

  it('el error de coma flotante no recorta una unidad: 100 × 0.29 = 29, no 28', () => {
    expect(refreshLaneCeiling(100, 0.29)).toBe(29);
    expect(refreshLaneCeiling(100, 0.57)).toBe(57);
  });

  it('una fracción negativa o no finita da techo 0 (refresco desactivado), nunca un techo negativo', () => {
    expect(refreshLaneCeiling(100, -0.1)).toBe(0);
    expect(refreshLaneCeiling(100, Number.NaN)).toBe(0);
  });
});

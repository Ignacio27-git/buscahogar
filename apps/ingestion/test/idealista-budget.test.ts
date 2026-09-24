// Paso 1.6 — createSweepBudget (R-BUDGET). Dos contadores independientes,
// nunca sumados (mismo razonamiento que probe-ledger.test.ts, paso 1.5): no
// está documentado si el token consume cuota de búsqueda, así que una cifra
// agregada afirmaría algo que no sabemos.
import { describe, expect, it } from 'vitest';

import { createSweepBudget } from '../src/sources/idealista/budget.js';
import { SweepBudgetExhaustedError } from '../src/sources/idealista/errors.js';

describe('createSweepBudget — contadores separados', () => {
  it('cuenta search y token por separado, nunca sumados', () => {
    const budget = createSweepBudget(5);
    budget.spend('search', { resumeCursor: 'homes:1' });
    budget.spend('token', { resumeCursor: 'homes:1' });
    expect(budget.snapshot()).toEqual({ search: 1, token: 1 });
  });
});

describe('createSweepBudget — tope de search (maxSearchRequestsPerSweep)', () => {
  it('lanza SweepBudgetExhaustedError con el cursor de reanudación al superar el tope', () => {
    const budget = createSweepBudget(2);
    budget.spend('search', { resumeCursor: 'homes:1' });
    budget.spend('search', { resumeCursor: 'homes:2' });

    expect(() => {
      budget.spend('search', { resumeCursor: 'homes:3' });
    }).toThrow(SweepBudgetExhaustedError);
  });

  it('el error lleva el resumeCursor exacto pasado en el intento que lo superó', () => {
    expect.assertions(3);
    const budget = createSweepBudget(1);
    budget.spend('search', { resumeCursor: 'homes:1' });

    try {
      budget.spend('search', { resumeCursor: 'homes:2' });
    } catch (error) {
      expect(error).toBeInstanceOf(SweepBudgetExhaustedError);
      if (error instanceof SweepBudgetExhaustedError) {
        expect(error.resumeCursor).toBe('homes:2');
        expect(error.spent).toEqual({ search: 1, token: 0 });
      }
    }
  });

  it('no incrementa el contador cuando el gasto lanza (el intento fallido no cuenta como gastado)', () => {
    const budget = createSweepBudget(1);
    budget.spend('search', { resumeCursor: 'homes:1' });
    expect(() => {
      budget.spend('search', { resumeCursor: 'homes:2' });
    }).toThrow();
    expect(budget.snapshot().search).toBe(1);
  });
});

describe('createSweepBudget — token con tope duro de 1, independiente de maxSearchRequestsPerSweep', () => {
  it('un segundo spend("token") lanza aunque el tope de search sea alto', () => {
    const budget = createSweepBudget(10);
    budget.spend('token', { resumeCursor: 'homes:1' });
    expect(() => {
      budget.spend('token', { resumeCursor: 'homes:1' });
    }).toThrow(SweepBudgetExhaustedError);
  });
});

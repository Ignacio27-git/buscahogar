// ROADMAP 3.3 (decisión 253; R4; S4.1-S4.4) — concesión por barrido del presweep y motivo de parada.
// Allowance = min(tope por barrido, tope de la ejecución restante, techo mensual del batch restante); cuando
// varios términos coinciden manda el más global (techo mensual > tope de la ejecución > tope por barrido).
import { describe, expect, it } from 'vitest';

import { stopsRun, sweepAllowance, unitStopReason } from '../src/presweep/allowance.js';

describe('sweepAllowance — mínimo de tres términos', () => {
  it('S4.1: tope por barrido 5, ejecución y mes holgados: 5, limita el tope por barrido', () => {
    expect(sweepAllowance({ perSweepCap: 5, runRemaining: 100, monthlyBatchRemaining: 1000 })).toEqual({
      allowance: 5,
      binding: 'per-sweep-cap',
    });
  });

  it('S4.2: 3 de techo mensual restante con tope por barrido 10: 3, limita el techo mensual del batch', () => {
    expect(sweepAllowance({ perSweepCap: 10, runRemaining: 100, monthlyBatchRemaining: 3 })).toEqual({
      allowance: 3,
      binding: 'monthly-batch-ceiling',
    });
  });

  it('S4.3: tope de la ejecución restante 2 con barrido 10 y techo 50: 2, limita el tope de la ejecución', () => {
    expect(sweepAllowance({ perSweepCap: 10, runRemaining: 2, monthlyBatchRemaining: 50 })).toEqual({
      allowance: 2,
      binding: 'run-cap',
    });
  });

  it('empate entre techo mensual y tope de la ejecución: manda el techo mensual (más global)', () => {
    expect(sweepAllowance({ perSweepCap: 10, runRemaining: 4, monthlyBatchRemaining: 4 }).binding).toBe(
      'monthly-batch-ceiling'
    );
  });

  it('empate entre tope de la ejecución y tope por barrido: manda el tope de la ejecución', () => {
    expect(sweepAllowance({ perSweepCap: 6, runRemaining: 6, monthlyBatchRemaining: 50 }).binding).toBe('run-cap');
  });

  it('empate a tres bandas: manda el techo mensual', () => {
    expect(sweepAllowance({ perSweepCap: 7, runRemaining: 7, monthlyBatchRemaining: 7 })).toEqual({
      allowance: 7,
      binding: 'monthly-batch-ceiling',
    });
  });

  it('techo mensual en 0: concesión 0, motivo techo mensual (la ejecución se detiene)', () => {
    expect(sweepAllowance({ perSweepCap: 5, runRemaining: 100, monthlyBatchRemaining: 0 })).toEqual({
      allowance: 0,
      binding: 'monthly-batch-ceiling',
    });
  });

  it('tope de la ejecución agotado (0): concesión 0, motivo tope de la ejecución', () => {
    expect(sweepAllowance({ perSweepCap: 5, runRemaining: 0, monthlyBatchRemaining: 100 })).toEqual({
      allowance: 0,
      binding: 'run-cap',
    });
  });
});

describe('unitStopReason — motivo con el que termina una unidad', () => {
  it('un barrido completado termina por unidad agotada, aunque haya gastado justo la concesión', () => {
    expect(unitStopReason('per-sweep-cap', 'completed')).toBe('unit-exhausted');
    expect(unitStopReason('monthly-batch-ceiling', 'completed')).toBe('unit-exhausted');
  });

  it('S4.1/S4.2/S4.3: presupuesto agotado = el término que limitaba la concesión', () => {
    expect(unitStopReason('per-sweep-cap', 'budget-exhausted')).toBe('per-sweep-cap');
    expect(unitStopReason('run-cap', 'budget-exhausted')).toBe('run-cap');
    expect(unitStopReason('monthly-batch-ceiling', 'budget-exhausted')).toBe('monthly-batch-ceiling');
  });

  it('S4.4: un fallo de la fuente termina por señal de la fuente, sea cual fuese el término limitante', () => {
    expect(unitStopReason('per-sweep-cap', 'failed')).toBe('upstream-signal');
    expect(unitStopReason('run-cap', 'failed')).toBe('upstream-signal');
  });
});

describe('stopsRun — qué motivos detienen toda la ejecución', () => {
  it('techo mensual, tope de la ejecución y señal de la fuente la detienen', () => {
    expect(stopsRun('monthly-batch-ceiling')).toBe(true);
    expect(stopsRun('run-cap')).toBe(true);
    expect(stopsRun('upstream-signal')).toBe(true);
  });

  it('tope por barrido y unidad agotada pasan a la unidad siguiente', () => {
    expect(stopsRun('per-sweep-cap')).toBe(false);
    expect(stopsRun('unit-exhausted')).toBe(false);
  });
});

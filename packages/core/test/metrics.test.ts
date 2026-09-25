// ROADMAP 2.2 — computeMetrics/wilsonInterval (decisión 089): P/R/F1 y el
// intervalo de Wilson 95% sobre bandas etiquetadas. `truth` es la ÚNICA
// fuente de la matriz de confusión — este módulo ni siquiera conoce
// `expected` (spec "Ground-Truth Labels": las métricas nunca se calculan
// sobre la banda diseñada de rule-based, solo sobre verdad terreno).
import { describe, expect, it } from 'vitest';

import { computeMetrics, wilsonInterval, type LabeledBand } from '../src/evaluation/metrics.js';

describe('wilsonInterval — intervalo de Wilson 95% (decisión 089, z=1.959963984540054)', () => {
  it('5/10 → [.2366,.7634] (caso de referencia estándar)', () => {
    const interval = wilsonInterval(5, 10);
    expect(interval).not.toBeNull();
    expect(interval?.low).toBeCloseTo(0.2366, 4);
    expect(interval?.high).toBeCloseTo(0.7634, 4);
  });

  it('10/10 → low ≈ .7225 (proporción perfecta, la cota inferior sigue siendo estricta)', () => {
    const interval = wilsonInterval(10, 10);
    expect(interval).not.toBeNull();
    expect(interval?.low).toBeCloseTo(0.7225, 4);
    expect(interval?.high).toBeCloseTo(1, 4);
  });

  it('0/0 → null (sin ensayos, ningún intervalo que calcular)', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe('computeMetrics — undecided cuenta como negativo (D2/decisión 089), undecidedRate aparte', () => {
  it('un duplicado real clasificado undecided cuenta como fallo de recall, no se excluye', () => {
    const bands: LabeledBand[] = [
      { id: 'a', truth: 'duplicate', band: 'accept' },
      { id: 'b', truth: 'duplicate', band: 'undecided' },
    ];

    const metrics = computeMetrics(bands);

    expect(metrics.counts.truePositive).toBe(1);
    expect(metrics.counts.undecidedDuplicate).toBe(1);
    // recall = TP / (TP + FN + undecidedDuplicate) = 1 / (1 + 0 + 1) = 0.5
    expect(metrics.recall.value).toBeCloseTo(0.5, 10);
    expect(metrics.recall.trials).toBe(2);
  });

  it('undecidedRate se reporta aparte de precision/recall, sobre el total de pares', () => {
    const bands: LabeledBand[] = [
      { id: 'a', truth: 'duplicate', band: 'accept' },
      { id: 'b', truth: 'distinct', band: 'undecided' },
      { id: 'c', truth: 'duplicate', band: 'reject' },
      { id: 'd', truth: 'distinct', band: 'reject' },
    ];

    const metrics = computeMetrics(bands);

    expect(metrics.counts.undecidedDistinct).toBe(1);
    expect(metrics.undecidedRate.value).toBeCloseTo(0.25, 10);
    expect(metrics.undecidedRate.trials).toBe(4);
    // precision solo cuenta la fila accept (1 ensayo); recall cuenta TP+FN+undecidedDuplicate (2)
    expect(metrics.precision.trials).toBe(1);
    expect(metrics.recall.trials).toBe(2);
  });

  it('F1 es null si precision es null (sin ningún accept, precision no tiene ensayos)', () => {
    const bands: LabeledBand[] = [{ id: 'a', truth: 'duplicate', band: 'reject' }];
    const metrics = computeMetrics(bands);

    expect(metrics.precision.value).toBeNull();
    expect(metrics.f1).toBeNull();
  });

  it('F1 es 0 si precision+recall suman 0 (ningún acierto en absoluto)', () => {
    const bands: LabeledBand[] = [
      { id: 'a', truth: 'duplicate', band: 'reject' },
      { id: 'b', truth: 'distinct', band: 'accept' },
    ];
    const metrics = computeMetrics(bands);

    // precision = 0/(0+1) = 0; recall = 0/(0+1+0) = 0 → F1 = 0, nunca null
    expect(metrics.precision.value).toBe(0);
    expect(metrics.recall.value).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('la matriz de confusión asigna las 6 combinaciones banda×truth a su casilla exacta', () => {
    const bands: LabeledBand[] = [
      { id: 'tp', truth: 'duplicate', band: 'accept' },
      { id: 'fp', truth: 'distinct', band: 'accept' },
      { id: 'fn', truth: 'duplicate', band: 'reject' },
      { id: 'tn', truth: 'distinct', band: 'reject' },
      { id: 'ud', truth: 'duplicate', band: 'undecided' },
      { id: 'ux', truth: 'distinct', band: 'undecided' },
    ];

    const { counts } = computeMetrics(bands);

    expect(counts).toEqual({
      truePositive: 1,
      falsePositive: 1,
      falseNegative: 1,
      trueNegative: 1,
      undecidedDuplicate: 1,
      undecidedDistinct: 1,
    });
  });

  it('con la lista vacía, todos los Proportion tienen 0 ensayos y value null', () => {
    const metrics = computeMetrics([]);

    expect(metrics.precision.trials).toBe(0);
    expect(metrics.precision.value).toBeNull();
    expect(metrics.undecidedRate.trials).toBe(0);
    expect(metrics.undecidedRate.value).toBeNull();
  });
});

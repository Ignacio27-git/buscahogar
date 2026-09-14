// Paso 1.7 — report.ts (CLI-4, CLI-5, COVERAGE-6). El informe de fin de
// barrido es la única superficie que puede afirmar "covered" — y solo
// cuando el barrido terminó completo, siempre nombrando el centro y el
// radio barridos explícitamente (P1: un círculo no es un municipio).
import { describe, expect, it } from 'vitest';

import type { AreaQuery } from '@buscahogar/core';

import { buildReport } from '../src/sweep/report.js';

const AREA: AreaQuery = { center: { latitude: 37.18, longitude: -3.6 }, radiusMeters: 2000, operation: 'sale' };

describe('buildReport — CLI-4a: el balance cuadra con los elementos procesados', () => {
  it('created + versioned + unchanged + rejected suma el total de la página (49 sin cambios + 1 rechazo)', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'completed',
      inserted: 0,
      versioned: 0,
      unchanged: 49,
      rejectedCount: 1,
      requestsSpent: 1,
    });
    expect(report.totalProcessed).toBe(50);
    expect(report.unchanged).toBe(49);
    expect(report.rejected).toBe(1);
  });

  it('created + versioned + unchanged + rejected suma el total también en un primer barrido (49 creados)', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'completed',
      inserted: 49,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 1,
      requestsSpent: 1,
    });
    expect(report.totalProcessed).toBe(50);
    expect(report.created).toBe(49);
  });
});

describe('buildReport — CLI-5b: un rechazo masivo es visible, no silencioso', () => {
  it('un rechazo de 40 de 50 se refleja íntegro en "rejected"', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'completed',
      inserted: 10,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 40,
      requestsSpent: 1,
    });
    expect(report.rejected).toBe(40);
    expect(report.totalProcessed).toBe(50);
  });
});

describe('buildReport — cursor de reanudación incluido cuando el barrido queda incompleto', () => {
  it('incluye resumeCursor cuando el resultado es budget-exhausted', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'budget-exhausted',
      inserted: 5,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 0,
      resumeCursor: 'homes:4',
      requestsSpent: 3,
    });
    expect(report.resumeCursor).toBe('homes:4');
  });

  it('incluye resumeCursor cuando el resultado es failed', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'failed',
      inserted: 2,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 0,
      resumeCursor: 'offices:2',
      error: 'fallo de transporte',
      requestsSpent: 4,
    });
    expect(report.resumeCursor).toBe('offices:2');
    expect(report.error).toBe('fallo de transporte');
  });
});

describe('buildReport — COVERAGE-6: una afirmación "covered" declara el centro y el radio exactos', () => {
  it('un barrido completo declara covered con el centro y radio barridos', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'completed',
      inserted: 1,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 0,
      requestsSpent: 1,
    });
    expect(report.covered).toEqual({ center: AREA.center, radiusMeters: AREA.radiusMeters });
  });

  it('un barrido agotado por tope NUNCA declara covered', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'budget-exhausted',
      inserted: 5,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 0,
      resumeCursor: 'homes:4',
      requestsSpent: 3,
    });
    expect(report.covered).toBeUndefined();
  });

  it('un barrido fallido NUNCA declara covered', () => {
    const report = buildReport({
      area: AREA,
      outcome: 'failed',
      inserted: 0,
      versioned: 0,
      unchanged: 0,
      rejectedCount: 0,
      error: 'boom',
      requestsSpent: 1,
    });
    expect(report.covered).toBeUndefined();
  });
});

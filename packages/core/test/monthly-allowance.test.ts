// ROADMAP 3.3 (decisión 248; R7, R8, D5, D6b) — reglas PURAS de techo mensual por
// carril. El test de base de datos de `reserveRequestBudget` (packages/db) recorre
// los MISMOS casos (mismos números) contra la sentencia SQL y los compara con
// `monthlyGrant`: la misma regla en TypeScript y en SQL, comprobada con los mismos
// datos.
import { describe, expect, it } from 'vitest';

import { laneCeiling, laneRemaining, monthlyGrant } from '../src/quota/monthly-allowance.js';
import type { MonthlyLedgerState, QuotaLane } from '../src/quota/monthly-allowance.js';

interface MonthlyGrantCase {
  readonly name: string;
  readonly lane: QuotaLane;
  readonly requested: number;
  readonly state: MonthlyLedgerState;
  readonly expectedGrant: number;
}

const BASE = { totalCap: 100, reserve: 30 } as const;

const MONTHLY_GRANT_CASES: readonly MonthlyGrantCase[] = [
  { name: 'S7.1 batch con total 100, reserva 30 y 70 gastados: denegado', lane: 'batch', requested: 1, state: { ...BASE, searchRequests: 70 }, expectedGrant: 0 },
  { name: 'S7.2 on-demand en el mismo estado entra en la reserva', lane: 'on-demand', requested: 1, state: { ...BASE, searchRequests: 70 }, expectedGrant: 1 },
  { name: 'S7.3 on-demand con total 100 y 100 gastados: denegado', lane: 'on-demand', requested: 1, state: { ...BASE, searchRequests: 100 }, expectedGrant: 0 },
  { name: 'D6b/S4.2 batch pide 10 con 3 de margen: concesión parcial de 3', lane: 'batch', requested: 10, state: { ...BASE, searchRequests: 67 }, expectedGrant: 3 },
  { name: 'batch pide exactamente lo que queda: lo concede entero', lane: 'batch', requested: 5, state: { ...BASE, searchRequests: 65 }, expectedGrant: 5 },
  { name: 'S8.1 el gasto de refresco ya cuenta: batch con 70 - 2 = 68 gastados recibe 2', lane: 'batch', requested: 10, state: { ...BASE, searchRequests: 68 }, expectedGrant: 2 },
  { name: 'S8.2 refresco comparte el fondo del batch: agotado el fondo, denegado', lane: 'refresh', requested: 1, state: { ...BASE, searchRequests: 70 }, expectedGrant: 0 },
  { name: 'refresco pide 4 con 3 de margen: exacto, no parcial', lane: 'refresh', requested: 4, state: { ...BASE, searchRequests: 67 }, expectedGrant: 0 },
  { name: 'refresco pide 3 con 3 de margen: concedido', lane: 'refresh', requested: 3, state: { ...BASE, searchRequests: 67 }, expectedGrant: 3 },
  { name: 'on-demand pide 5 con 3 de margen total: exacto, denegado', lane: 'on-demand', requested: 5, state: { ...BASE, searchRequests: 97 }, expectedGrant: 0 },
  { name: 'reserva 0 explícita: batch puede usar todo el total', lane: 'batch', requested: 10, state: { totalCap: 100, reserve: 0, searchRequests: 95 }, expectedGrant: 5 },
];

describe('laneCeiling — techo del gasto TOTAL del mes por carril (D5)', () => {
  it('batch, refresco y presencia comparten total - reserva; on-demand usa el total', () => {
    expect(laneCeiling('batch', BASE)).toBe(70);
    expect(laneCeiling('refresh', BASE)).toBe(70);
    expect(laneCeiling('on-demand', BASE)).toBe(100);
  });
});

describe('laneRemaining — margen del carril, nunca negativo', () => {
  it('es techo - gastado', () => {
    expect(laneRemaining('batch', { ...BASE, searchRequests: 20 })).toBe(50);
    expect(laneRemaining('on-demand', { ...BASE, searchRequests: 20 })).toBe(80);
  });

  it('se acota a 0 cuando el gasto supera el techo del carril (gasto a demanda dentro de la reserva)', () => {
    expect(laneRemaining('batch', { ...BASE, searchRequests: 85 })).toBe(0);
    expect(laneRemaining('refresh', { ...BASE, searchRequests: 100 })).toBe(0);
    expect(laneRemaining('on-demand', { ...BASE, searchRequests: 85 })).toBe(15);
  });
});

describe('monthlyGrant — concesión por carril (R7, R8, D6b)', () => {
  it.each(MONTHLY_GRANT_CASES)('$name', ({ lane, requested, state, expectedGrant }) => {
    expect(monthlyGrant(lane, requested, state)).toBe(expectedGrant);
  });

  it('el batch con margen 0 nunca concede aunque pida mucho', () => {
    expect(monthlyGrant('batch', 1000, { ...BASE, searchRequests: 70 })).toBe(0);
  });
});

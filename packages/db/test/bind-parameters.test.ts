// Paso 3.2 (seguimiento) — RED primero: `chunkByBindParameters` no existe
// todavía. Prueba PURA, sin base de datos. Reproduce en aritmética el fallo
// real del worker de cobertura tras barrer Granada: un único INSERT
// multi-fila de `dedup_pair_evidence` con ~12 485 pares × 8 parámetros =
// 99 880 parámetros ligados, por encima del tope de 65 535 del protocolo de
// PostgreSQL (el recuento viaja como uint16 y se desbordó a 34 344 → 08P01).
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  BIND_PARAMETER_BUDGET,
  POSTGRES_MAX_BIND_PARAMETERS,
  chunkByBindParameters,
} from '../src/bind-parameters.js';
import { dedupPairEvidence } from '../src/tables.js';

describe('chunkByBindParameters', () => {
  it('el presupuesto por sentencia deja margen bajo el tope de 65 535 del protocolo', () => {
    expect(POSTGRES_MAX_BIND_PARAMETERS).toBe(65_535);
    expect(BIND_PARAMETER_BUDGET).toBeLessThan(POSTGRES_MAX_BIND_PARAMETERS);
  });

  it('el caso real de Granada (12 485 pares de evidencia) se parte en lotes bajo el tope, sin perder ni reordenar filas', () => {
    const columnsPerRow = Object.keys(getTableColumns(dedupPairEvidence)).length;
    const rows = Array.from({ length: 12_485 }, (_, index) => index);

    const batches = chunkByBindParameters(rows, columnsPerRow);

    expect(rows.length * columnsPerRow).toBeGreaterThan(POSTGRES_MAX_BIND_PARAMETERS);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.length * columnsPerRow).toBeLessThanOrEqual(BIND_PARAMETER_BUDGET);
    }
    expect(batches.flat()).toEqual(rows);
  });

  it('una entrada que cabe en una sola sentencia sale en un único lote', () => {
    const rows = ['a', 'b', 'c'];
    expect(chunkByBindParameters(rows, 10)).toEqual([['a', 'b', 'c']]);
  });

  it('una entrada vacía no produce ningún lote (Drizzle rechaza `.values([])`)', () => {
    expect(chunkByBindParameters([], 10)).toEqual([]);
  });

  it('el lote se llena exactamente hasta el presupuesto, nunca por encima', () => {
    const rows = Array.from({ length: 7 }, (_, index) => index);
    expect(chunkByBindParameters(rows, 1, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
  });

  it('rechaza un número de parámetros por fila que no sea un entero positivo o que no quepa en el presupuesto', () => {
    expect(() => chunkByBindParameters([1], 0)).toThrow(RangeError);
    expect(() => chunkByBindParameters([1], 1.5)).toThrow(RangeError);
    expect(() => chunkByBindParameters([1], 11, 10)).toThrow(RangeError);
  });
});

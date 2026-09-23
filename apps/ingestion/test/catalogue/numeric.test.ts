// Adaptación al NGMEP real (paso 1.13 continuado) — EL detalle crítico del
// fichero real: las coordenadas y la superficie usan coma decimal
// (`LONGITUD_ETRS89_REGCAN95=-2,512507724`). `parseFloat('-2,512507724')`
// devuelve `-2` SIN avisar (para en la coma, como si fuera un separador de
// miles): cada centroide aterrizaría a cientos de kilómetros de distancia, y
// la puerta de cordura de la caja de España (sanity.ts) seguiría pasando,
// porque -2,42 también cae dentro de España. El recuento de filas parecería
// perfecto. Este test se escribe ANTES que `parseCommaDecimal` (RED→GREEN):
// prueba que el valor completo se conserva y que una entrada mal formada
// falla ruidoso, nunca trunca en silencio.
import { describe, expect, it } from 'vitest';

import { MalformedDecimalError, parseCommaDecimal } from '../../src/catalogue/numeric.js';

describe('parseCommaDecimal — nunca trunca en la coma, nunca falla en silencio', () => {
  it('conserva el valor COMPLETO de un decimal negativo con coma, no solo la parte entera', () => {
    // Caso real: LONGITUD_ETRS89_REGCAN95 de Alegría-Dulantzi (MUNICIPIOS.csv).
    // parseFloat('-2,512507724') da -2 — este test falla con esa
    // implementación y solo pasa con el reemplazo de coma por punto.
    expect(parseCommaDecimal('-2,512507724')).toBeCloseTo(-2.512507724, 9);
  });

  it('conserva el valor completo de un decimal positivo con coma', () => {
    expect(parseCommaDecimal('42,84045247')).toBeCloseTo(42.84045247, 8);
  });

  it('parsea SUPERFICIE (hectáreas, coma decimal) igual que una coordenada', () => {
    expect(parseCommaDecimal('8806,81')).toBeCloseTo(8806.81, 2);
  });

  it('acepta un entero sin separador decimal', () => {
    expect(parseCommaDecimal('35069')).toBe(35069);
  });

  it('acepta también punto decimal (por si una columna no usa coma)', () => {
    expect(parseCommaDecimal('3.14')).toBeCloseTo(3.14, 2);
  });

  it('falla RUIDOSO en cadena vacía, nunca devuelve 0 ni NaN en silencio', () => {
    expect(() => parseCommaDecimal('')).toThrow(MalformedDecimalError);
  });

  it('falla ruidoso en un valor no numérico', () => {
    expect(() => parseCommaDecimal('abc')).toThrow(MalformedDecimalError);
  });

  it('falla ruidoso con más de un separador decimal (dato corrupto, nunca adivinado)', () => {
    expect(() => parseCommaDecimal('1,2,3')).toThrow(MalformedDecimalError);
    try {
      parseCommaDecimal('1,2,3');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('1,2,3');
    }
  });
});

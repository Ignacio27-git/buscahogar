import { describe, expect, it } from 'vitest';

import { formatDecimal, parseSpanishNumber, shiftDecimal } from '../src/nl-search/amount.js';

// ROADMAP 3.1 — aritmética decimal exacta sobre cadenas: 1,1 * 1000 en coma
// flotante da 1100.0000000000002, y un importe así llegaría a la URL.
describe('parseSpanishNumber', () => {
  const parse = (value: string): string | null => {
    const decimal = parseSpanishNumber(value);
    return decimal === null ? null : formatDecimal(decimal);
  };

  it('el punto con exactamente tres dígitos detrás es separador de millares', () => {
    expect(parse('1.200')).toBe('1200');
    expect(parse('1.200.000')).toBe('1200000');
    expect(parse('300.000,50')).toBe('300000.5');
  });

  it('la coma es el separador decimal: "1,2" es 1.2', () => {
    expect(parse('1,2')).toBe('1.2');
    expect(parse('1,200')).toBe('1.2');
  });

  it('un punto que no cumple el patrón de millares es decimal: "1.5"', () => {
    expect(parse('1.5')).toBe('1.5');
    expect(parse('0.500')).toBe('0.5');
  });

  it('enteros simples y ceros a la izquierda', () => {
    expect(parse('900')).toBe('900');
    expect(parse('007')).toBe('7');
    expect(parse('0')).toBe('0');
  });

  it('formas ambiguas o mal agrupadas se rechazan', () => {
    expect(parse('1.20.0')).toBeNull();
    expect(parse('1,2,3')).toBeNull();
    expect(parse('12.34.567')).toBeNull();
    expect(parse('abc')).toBeNull();
    expect(parse('')).toBeNull();
  });
});

describe('shiftDecimal', () => {
  const shift = (value: string, places: number): string => {
    const decimal = parseSpanishNumber(value);
    if (decimal === null) {
      throw new Error('entrada inválida de la prueba');
    }
    return formatDecimal(shiftDecimal(decimal, places));
  };

  it('desplaza la coma como cadena: 1,2 mil = 1200 y 1,1 mil = 1100', () => {
    expect(shift('1,2', 3)).toBe('1200');
    expect(shift('1,1', 3)).toBe('1100');
  });

  it('200 mil = 200000 y 2,5 millones = 2500000', () => {
    expect(shift('200', 3)).toBe('200000');
    expect(shift('2,5', 6)).toBe('2500000');
  });

  it('un desplazamiento que no agota los decimales los conserva: 1,2345 * 10 = 12.345', () => {
    expect(shift('1,2345', 1)).toBe('12.345');
  });

  it('desplazar cero sigue siendo cero', () => {
    expect(shift('0', 3)).toBe('0');
  });
});

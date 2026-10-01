// ROADMAP 2.3 — hammingDistance64 (decisión 095): distancia de Hamming pura
// entre dos hashes de 64 bits codificados como 16 caracteres hexadecimales,
// SIN BigInt (dos mitades de 32 bits, XOR + popcount SWAR por mitad). Cero
// I/O, cero aleatoriedad, cero dependencia de plataforma — el propio
// comparador de imágenes (compare.ts) lo reutiliza como único cálculo de
// distancia.
import { describe, expect, it } from 'vitest';

import { hammingDistance64 } from '../src/strategies/image/hamming.js';

describe('hammingDistance64 (ROADMAP 2.3, decisión 095)', () => {
  it('es determinista: el mismo par de hashes fijos produce el mismo entero en dos llamadas', () => {
    const a = '0000000000000000';
    const b = 'ffffffffffffffff';

    const first = hammingDistance64(a, b);
    const second = hammingDistance64(a, b);

    expect(first).toBe(64);
    expect(second).toBe(64);
  });

  it('está acotada en [0,64] para pares arbitrarios y cuenta bits distintos exactos', () => {
    // a y b difieren en exactamente 3 bits: bit 0 del primer byte, bit 0 del
    // último byte, y un bit intermedio — construido a mano para poder
    // predecir el resultado exacto, no solo el rango.
    const a = '0000000000000000';
    const b = '8000000000000081'; // 1000...0000 1000 0001 → 3 bits a 1

    const distance = hammingDistance64(a, b);

    expect(distance).toBe(3);
    expect(Number.isInteger(distance)).toBe(true);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(64);
  });

  it('la distancia de un hash consigo mismo es 0 (frontera inferior real, no asumida)', () => {
    const hash = '1a2b3c4d5e6f7890';

    expect(hammingDistance64(hash, hash)).toBe(0);
  });

  it('lanza RangeError si algún hash no tiene exactamente 16 caracteres hexadecimales', () => {
    const valid = '0000000000000000';

    expect(() => hammingDistance64('short', valid)).toThrow(RangeError);
    expect(() => hammingDistance64(valid, 'g000000000000000')).toThrow(RangeError);
    expect(() => hammingDistance64('00000000000000000', valid)).toThrow(RangeError);
  });
});

// ROADMAP 2.3 — phashFromGrey32 (decisión 095): DCT-II 2D pura sobre un
// buffer de 32x32 píxeles en escala de grises, top-left 8x8 (DC incluido),
// umbral por mediana de los coeficientes 32/33, empaquetado row-major
// MSB-first a 16 caracteres hexadecimales en minúscula. Cero I/O — el
// decodificador de sharp vive en pipeline.ts, nunca aquí.
import { describe, expect, it } from 'vitest';

import { phashFromGrey32 } from '../src/image-hash/phash.js';

const SIZE = 32;

function halfWhiteHalfBlack(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE);
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      pixels[x * SIZE + y] = y < SIZE / 2 ? 20 : 235;
    }
  }
  return pixels;
}

function diagonalGradient(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE);
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      pixels[x * SIZE + y] = Math.round(((x + y) / (2 * (SIZE - 1))) * 255);
    }
  }
  return pixels;
}

describe('phashFromGrey32 (ROADMAP 2.3, decisión 095)', () => {
  it('es determinista: el mismo buffer de píxeles produce el mismo hash en dos llamadas', () => {
    const pixels = halfWhiteHalfBlack();

    expect(phashFromGrey32(pixels)).toBe(phashFromGrey32(pixels));
  });

  it('produce 16 caracteres hexadecimales en minúscula', () => {
    const hash = phashFromGrey32(halfWhiteHalfBlack());

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('dos patrones claramente distintos producen hashes distintos', () => {
    const hashA = phashFromGrey32(halfWhiteHalfBlack());
    const hashB = phashFromGrey32(diagonalGradient());

    expect(hashA).not.toBe(hashB);
  });

  it('lanza RangeError si el buffer no tiene exactamente 32x32 píxeles', () => {
    expect(() => phashFromGrey32(new Uint8Array(100))).toThrow(RangeError);
  });
});

// hashImage (ROADMAP 2.3, decisión 095): decodifica -> aplana sobre BLANCO
// (no el negro por defecto de sharp: la mayoría de portales usan fondo
// blanco, y aplanar a negro introduciría un sesgo sistemático en cualquier
// imagen con transparencia) -> recorta el margen central del 5% por lado
// (reduce la influencia del chrome de portal cerca del borde, sin depender
// de él para eliminar logos superpuestos en otras zonas — spec
// "Preprocessing Before Hashing") -> escala de grises -> redimensiona a
// 32x32 con el kernel lanczos3 -> píxeles crudos de un canal -> pHash DCT.
// Una imagen de contenido plano (stddev < LOW_ENTROPY_STDDEV) SIGUE
// hasheándose — solo se marca `lowEntropy`, nunca se descarta (spec
// "Preprocessing Before Hashing": "MAY still compute and record its hash").
import type { ImageHashEntry } from '@buscahogar/core';
import sharp from 'sharp';

import { phashFromGrey32 } from './phash.js';

export const CROP_MARGIN_RATIO = 0.05;
export const LOW_ENTROPY_STDDEV = 10;
const TARGET_SIZE = 32;

export interface CentralRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

// Pura, sin sharp: el margen se calcula sobre las dimensiones reales de la
// imagen decodificada, nunca sobre un tamaño fijo — testeable sin decodificar
// nada.
export function computeCentralRegion(width: number, height: number): CentralRegion {
  const left = Math.round(width * CROP_MARGIN_RATIO);
  const top = Math.round(height * CROP_MARGIN_RATIO);
  return { left, top, width: width - 2 * left, height: height - 2 * top };
}

function standardDeviation(pixels: Uint8Array): number {
  if (pixels.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const value of pixels) {
    sum += value;
  }
  const mean = sum / pixels.length;

  let squaredDiffSum = 0;
  for (const value of pixels) {
    squaredDiffSum += (value - mean) ** 2;
  }

  return Math.sqrt(squaredDiffSum / pixels.length);
}

export async function hashImage(buf: Buffer): Promise<ImageHashEntry> {
  // `width`/`height` de Metadata NO son opcionales en el tipo de sharp
  // (decisión 095, verificación Context7/tipos instalados, tarea 2.3) — el
  // único caso "sin dimensiones" que nos concierne es un decode fallido,
  // que el catch ya cubre. `region.width/height <= 0` cubre además una
  // imagen degenerada (1x1 px) donde el margen del 5% redondeado se come
  // toda la imagen.
  let width: number;
  let height: number;
  try {
    ({ width, height } = await sharp(buf, { failOn: 'error' }).metadata());
  } catch {
    return { kind: 'unreadable' };
  }

  const region = computeCentralRegion(width, height);
  if (region.width <= 0 || region.height <= 0) {
    return { kind: 'unreadable' };
  }

  let pixels: Buffer;
  try {
    const processed = await sharp(buf, { failOn: 'error' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .extract(region)
      .greyscale()
      .resize({ width: TARGET_SIZE, height: TARGET_SIZE, fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = processed.data;
  } catch {
    return { kind: 'unreadable' };
  }

  const lowEntropy = standardDeviation(pixels) < LOW_ENTROPY_STDDEV;
  const hash = phashFromGrey32(pixels);

  return { kind: 'hashed', hash, lowEntropy };
}

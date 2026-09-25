// ROADMAP 2.3 — applyTransform (decisión 096): variantes deterministas de
// una imagen base, generadas EN MEMORIA con sharp — nunca se comiten
// binarios de cada variante. Cada transformación, aplicada dos veces al
// MISMO buffer base, debe producir bytes idénticos (Phase 3/4 dependen de
// esto para que `hashes.*.json` sea reproducible, spec "Fixture hashes are
// reproducible").
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { applyTransform, type ImageTransformKind } from '../src/image-hash/transforms.js';

const TRANSFORM_KINDS: readonly ImageTransformKind[] = [
  'rescale',
  'jpeg',
  'webp',
  'crop',
  'overlay',
  'portalA',
  'portalB',
];

async function baseImage(): Promise<Buffer> {
  // Contenido variado (no un color plano): un degradado diagonal, para que
  // recortar/redimensionar/recomprimir tengan algo real sobre lo que operar.
  const size = 120;
  const channels = 3;
  const pixels = Buffer.alloc(size * size * channels);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const value = Math.round(((x + y) / (2 * (size - 1))) * 255);
      const offset = (x * size + y) * channels;
      pixels[offset] = value;
      pixels[offset + 1] = 255 - value;
      pixels[offset + 2] = value;
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

describe('applyTransform (ROADMAP 2.3, decisión 096)', () => {
  it.each(TRANSFORM_KINDS)(
    '%s: aplicado dos veces al mismo buffer base produce bytes idénticos',
    async (kind) => {
      const base = await baseImage();

      const first = await applyTransform(base, { kind });
      const second = await applyTransform(base, { kind });

      expect(first.equals(second)).toBe(true);
    }
  );

  it.each(TRANSFORM_KINDS)('%s: produce un buffer de imagen decodificable', async (kind) => {
    const base = await baseImage();

    const result = await applyTransform(base, { kind });
    const metadata = await sharp(result).metadata();

    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });

  it('portalA y portalB producen resultados distintos entre sí sobre la misma base (dos "portales" distintos)', async () => {
    const base = await baseImage();

    const a = await applyTransform(base, { kind: 'portalA' });
    const b = await applyTransform(base, { kind: 'portalB' });

    expect(a.equals(b)).toBe(false);
  });
});

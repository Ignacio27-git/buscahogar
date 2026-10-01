// ROADMAP 2.3 — hashImage (decisión 095): pipeline sharp -> DCT pHash,
// ejercitado con imágenes sintéticas `sharp({create})` — sin red, sin
// ficheros. Cubre: fallo de decodificación, piso de baja entropía, flatten
// sobre blanco (no el negro por defecto de sharp) y el margen de recorte
// central del 5%.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { computeCentralRegion, hashImage } from '../src/image-hash/pipeline.js';

const SIZE = 40;

async function solidPng(background: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background } })
    .png()
    .toBuffer();
}

async function checkerboardPng(): Promise<Buffer> {
  // Cuadros de 5x5 alternando claro/oscuro — variación de contenido real,
  // no un color plano.
  const channels = 3;
  const pixels = Buffer.alloc(SIZE * SIZE * channels);
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      const light = (Math.floor(x / 5) + Math.floor(y / 5)) % 2 === 0;
      const value = light ? 235 : 20;
      const offset = (x * SIZE + y) * channels;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
    }
  }
  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels } })
    .png()
    .toBuffer();
}

describe('hashImage (ROADMAP 2.3, decisión 095)', () => {
  it('devuelve {kind:"unreadable"} ante un buffer que no es una imagen decodificable', async () => {
    const entry = await hashImage(Buffer.from('esto no es una imagen'));

    expect(entry).toEqual({ kind: 'unreadable' });
  });

  it('una imagen de color plano (sin variación) se marca lowEntropy:true, con hash igualmente', async () => {
    const entry = await hashImage(await solidPng({ r: 128, g: 128, b: 128 }));

    expect(entry.kind).toBe('hashed');
    if (entry.kind === 'hashed') {
      expect(entry.lowEntropy).toBe(true);
      expect(entry.hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('una imagen con contenido variado se marca lowEntropy:false y produce un hash', async () => {
    const entry = await hashImage(await checkerboardPng());

    expect(entry.kind).toBe('hashed');
    if (entry.kind === 'hashed') {
      expect(entry.lowEntropy).toBe(false);
      expect(entry.hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('aplica flatten sobre BLANCO: una imagen totalmente transparente hashea como blanco sólido, no como el negro por defecto de sharp', async () => {
    const transparent = await sharp({
      create: {
        width: SIZE,
        height: SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const [transparentEntry, whiteEntry, blackEntry] = await Promise.all([
      hashImage(transparent),
      hashImage(await solidPng({ r: 255, g: 255, b: 255 })),
      hashImage(await solidPng({ r: 0, g: 0, b: 0 })),
    ]);

    expect(transparentEntry.kind).toBe('hashed');
    expect(whiteEntry.kind).toBe('hashed');
    expect(blackEntry.kind).toBe('hashed');
    if (
      transparentEntry.kind === 'hashed' &&
      whiteEntry.kind === 'hashed' &&
      blackEntry.kind === 'hashed'
    ) {
      expect(transparentEntry.hash).toBe(whiteEntry.hash);
      expect(transparentEntry.hash).not.toBe(blackEntry.hash);
    }
  });
});

describe('computeCentralRegion (ROADMAP 2.3, decisión 095) — margen de recorte central del 5% por lado', () => {
  it('recorta exactamente el 5% de ancho y alto por cada lado', () => {
    expect(computeCentralRegion(100, 200)).toEqual({ left: 5, top: 10, width: 90, height: 180 });
  });

  it('redondea al entero más cercano para dimensiones no exactas', () => {
    expect(computeCentralRegion(101, 101)).toEqual({ left: 5, top: 5, width: 91, height: 91 });
  });
});

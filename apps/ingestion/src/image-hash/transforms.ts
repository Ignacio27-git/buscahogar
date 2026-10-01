// applyTransform (ROADMAP 2.3, decisión 096): variantes DETERMINISTAS de una
// imagen base, generadas EN MEMORIA — nunca se comiten binarios de cada
// variante, solo la foto base (Phase 3); estas transformaciones se
// recalculan cada vez que hace falta un par de prueba. Cada una simula un
// tipo real de degradación/presentación de portal: reescalado, recompresión
// JPEG/WebP, recorte distinto, logo superpuesto (raster generado, sin
// fuentes/SVG — determinismo entre máquinas), o chrome de portal (dos
// estilos DISTINTOS, portalA/portalB, para el caso difícil hn-1/hn-7: misma
// fachada, "portal" distinto). Sin aleatoriedad ni marcas de tiempo en
// ningún transform: el mismo buffer de entrada SIEMPRE produce los mismos
// bytes de salida (spec "Fixture hashes are reproducible").
import sharp from 'sharp';

export type ImageTransformKind =
  'rescale' | 'jpeg' | 'webp' | 'crop' | 'overlay' | 'portalA' | 'portalB';

export interface ImageTransform {
  readonly kind: ImageTransformKind;
}

// Lista canónica de los 7 kinds (ROADMAP 2.3, Phase 3: scripts/
// generate-image-hashes.ts y src/image-hash/calibration.ts la reutilizan en
// vez de repetir el literal — evita que las dos listas se desincronicen si
// algún día se añade un octavo transform).
export const IMAGE_TRANSFORM_KINDS: readonly ImageTransformKind[] = [
  'rescale',
  'jpeg',
  'webp',
  'crop',
  'overlay',
  'portalA',
  'portalB',
];

const RESCALE_RATIO = 0.6;
const RESCALE_JPEG_QUALITY = 85;
const JPEG_QUALITY = 60;
const WEBP_QUALITY = 60;
const CROP_MARGIN_RATIO = 0.1;
const CROP_JPEG_QUALITY = 90;
const OVERLAY_SIZE_RATIO = 0.2;
const OVERLAY_JPEG_QUALITY = 90;
const CHROME_BAR_RATIO = 0.08;
const CHROME_JPEG_QUALITY = 90;

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

async function dimensionsOf(buf: Buffer): Promise<Dimensions> {
  const { width, height } = await sharp(buf).metadata();
  return { width, height };
}

// Logo generado como rectángulo sólido semitransparente — decisión 096:
// "sin fuentes/SVG", para no depender de qué fuentes tenga instaladas la
// máquina que regenera los hashes (spec "Reference platform is local
// Windows").
async function generateLogoOverlay(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 80, b: 200, alpha: 0.85 } },
  })
    .png()
    .toBuffer();
}

async function withChromeBar(
  buf: Buffer,
  position: 'top' | 'bottom',
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  const { width, height } = await dimensionsOf(buf);
  const barHeight = Math.max(1, Math.round(height * CHROME_BAR_RATIO));
  const bar = await sharp({ create: { width, height: barHeight, channels: 3, background: color } })
    .png()
    .toBuffer();

  return sharp(buf)
    .composite([{ input: bar, top: position === 'top' ? 0 : height - barHeight, left: 0 }])
    .jpeg({ quality: CHROME_JPEG_QUALITY })
    .toBuffer();
}

async function rescale(buf: Buffer): Promise<Buffer> {
  const { width } = await dimensionsOf(buf);
  const targetWidth = Math.max(1, Math.round(width * RESCALE_RATIO));
  return sharp(buf)
    .resize({ width: targetWidth })
    .jpeg({ quality: RESCALE_JPEG_QUALITY })
    .toBuffer();
}

async function crop(buf: Buffer): Promise<Buffer> {
  const { width, height } = await dimensionsOf(buf);
  const left = Math.round(width * CROP_MARGIN_RATIO);
  const top = Math.round(height * CROP_MARGIN_RATIO);
  return sharp(buf)
    .extract({ left, top, width: width - 2 * left, height: height - 2 * top })
    .jpeg({ quality: CROP_JPEG_QUALITY })
    .toBuffer();
}

async function overlay(buf: Buffer): Promise<Buffer> {
  const { width, height } = await dimensionsOf(buf);
  const overlayWidth = Math.max(1, Math.round(width * OVERLAY_SIZE_RATIO));
  const overlayHeight = Math.max(1, Math.round(height * OVERLAY_SIZE_RATIO));
  const logo = await generateLogoOverlay(overlayWidth, overlayHeight);

  return sharp(buf)
    .composite([{ input: logo, top: height - overlayHeight, left: width - overlayWidth }])
    .jpeg({ quality: OVERLAY_JPEG_QUALITY })
    .toBuffer();
}

// Dos estilos de chrome DELIBERADAMENTE distintos (posición y color): la
// pareja hn-1/hn-7 (misma fachada, decisión 098) usa portalA/portalB para
// comprobar que el margen de recorte central absorbe la diferencia de
// chrome, no que la elimina el propio transform.
export function applyTransform(buf: Buffer, transform: ImageTransform): Promise<Buffer> {
  switch (transform.kind) {
    case 'rescale':
      return rescale(buf);
    case 'jpeg':
      return sharp(buf).jpeg({ quality: JPEG_QUALITY }).toBuffer();
    case 'webp':
      return sharp(buf).webp({ quality: WEBP_QUALITY }).toBuffer();
    case 'crop':
      return crop(buf);
    case 'overlay':
      return overlay(buf);
    case 'portalA':
      return withChromeBar(buf, 'top', { r: 240, g: 240, b: 240 });
    case 'portalB':
      return withChromeBar(buf, 'bottom', { r: 20, g: 20, b: 20 });
  }
}

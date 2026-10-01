// phashFromGrey32 (ROADMAP 2.3, decisión 095): pHash DCT determinista sobre
// un buffer de 32x32 píxeles en escala de grises (row-major, un byte por
// píxel). DCT-II 2D SIN normalizar — no hace falta: solo se compara el
// ORDEN relativo de los 64 coeficientes de baja frecuencia frente a su
// mediana, y escalar todos los coeficientes por la misma constante nunca
// cambia ese orden. Cero I/O: decodificar la imagen real vive en
// pipeline.ts, este módulo solo transforma un array de números.
const IMAGE_SIZE = 32;
const DCT_SIZE = 8;
const HASH_BYTES = 8;
const PIXEL_COUNT = IMAGE_SIZE * IMAGE_SIZE;

// cosineTable[index][freq] = cos((2*index+1)*freq*pi/(2*IMAGE_SIZE)) —
// misma fórmula para el eje de filas y el de columnas (DCT-II 2D es
// separable y simétrica en ambos ejes). Solo se precalculan las DCT_SIZE
// frecuencias más bajas por eje: son las únicas que el hash usa.
// Precalculada UNA vez al cargar el módulo, reutilizada en cada llamada.
function buildCosineTable(): readonly (readonly number[])[] {
  const table: number[][] = [];
  for (let index = 0; index < IMAGE_SIZE; index += 1) {
    const row: number[] = [];
    for (let freq = 0; freq < DCT_SIZE; freq += 1) {
      row.push(Math.cos(((2 * index + 1) * freq * Math.PI) / (2 * IMAGE_SIZE)));
    }
    table.push(row);
  }
  return table;
}

const COSINE_TABLE = buildCosineTable();

function cosineAt(table: readonly (readonly number[])[], index: number, freq: number): number {
  return table[index]?.[freq] ?? 0;
}

// DCT-II 2D separable, solo las DCT_SIZE x DCT_SIZE frecuencias más bajas
// (DC en [0][0]): pasada 1 transforma cada fila a lo largo del eje Y
// (columnas); pasada 2 transforma ese resultado a lo largo del eje X
// (filas). O(IMAGE_SIZE² · DCT_SIZE · 2), no O(IMAGE_SIZE⁴) — evita
// calcular las 32x32 frecuencias completas cuando solo hacen falta 64.
function dctTopLeft8x8(pixels: Uint8Array): readonly (readonly number[])[] {
  const alongY: number[][] = [];
  for (let x = 0; x < IMAGE_SIZE; x += 1) {
    const coefficients: number[] = [];
    for (let freqY = 0; freqY < DCT_SIZE; freqY += 1) {
      let sum = 0;
      for (let y = 0; y < IMAGE_SIZE; y += 1) {
        sum += (pixels[x * IMAGE_SIZE + y] ?? 0) * cosineAt(COSINE_TABLE, y, freqY);
      }
      coefficients.push(sum);
    }
    alongY.push(coefficients);
  }

  const result: number[][] = [];
  for (let freqX = 0; freqX < DCT_SIZE; freqX += 1) {
    const row: number[] = [];
    for (let freqY = 0; freqY < DCT_SIZE; freqY += 1) {
      let sum = 0;
      for (let x = 0; x < IMAGE_SIZE; x += 1) {
        sum += (alongY[x]?.[freqY] ?? 0) * cosineAt(COSINE_TABLE, x, freqX);
      }
      row.push(sum);
    }
    result.push(row);
  }

  return result;
}

// Empaqueta 64 bits (row-major, primer bit = MSB del primer byte) a 8
// caracteres hexadecimales en minúscula por byte → 16 caracteres.
function packBitsToHex(bits: readonly boolean[]): string {
  const bytes = new Uint8Array(HASH_BYTES);
  bits.forEach((bit, index) => {
    if (!bit) {
      return;
    }
    const byteIndex = Math.floor(index / 8);
    const shift = 7 - (index % 8);
    bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (1 << shift);
  });

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function phashFromGrey32(pixels: Uint8Array): string {
  if (pixels.length !== PIXEL_COUNT) {
    throw new RangeError(
      `phashFromGrey32: se esperan ${String(PIXEL_COUNT)} píxeles (32x32 en escala de grises), recibido ${String(pixels.length)}.`
    );
  }

  const dct = dctTopLeft8x8(pixels);

  // Aplanado row-major: fila 0 (freqX=0) columnas 0..7, fila 1, ... — el
  // mismo orden que packBitsToHex usa para asignar bits.
  const coefficients: number[] = [];
  for (let freqX = 0; freqX < DCT_SIZE; freqX += 1) {
    for (let freqY = 0; freqY < DCT_SIZE; freqY += 1) {
      coefficients.push(dct[freqX]?.[freqY] ?? 0);
    }
  }

  // Mediana = media del 32º y 33º coeficiente más pequeño (1-indexado;
  // índices 31 y 32 en la lista ordenada, 0-indexada) — decisión 095.
  const sorted = [...coefficients].sort((a, b) => a - b);
  const median = ((sorted[31] ?? 0) + (sorted[32] ?? 0)) / 2;

  const bits = coefficients.map((coefficient) => coefficient > median);

  return packBitsToHex(bits);
}

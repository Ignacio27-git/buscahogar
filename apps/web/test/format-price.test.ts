// ROADMAP 2.6 (decisión 119) — `formatPriceCents` compartido por la tarjeta,
// la cabecera de detalle, la lista de fuentes y las etiquetas del mapa.
import { describe, expect, it } from 'vitest';

import { formatPriceCents, formatPriceChange } from '../src/lib/format-price.js';

// D.10 (decisión 178) — variación del histórico de precios: signo explícito
// (U+2212 para el menos, nunca el guion), importe por `formatPriceCents` y
// porcentaje con una decimal y espacio duro antes del %.
describe('formatPriceChange — D.10', () => {
  const minus = '−';
  const nbsp = ' ';

  it('una bajada lleva U+2212 en importe y porcentaje', () => {
    expect(formatPriceChange(-5_000, -56)).toBe(`${minus}50 € (${minus}5,6${nbsp}%)`);
  });

  it('una subida lleva signo + explícito', () => {
    expect(formatPriceChange(1_500, 18)).toBe(`+15 € (+1,8${nbsp}%)`);
  });

  it('un porcentaje entero no lleva decimal', () => {
    expect(formatPriceChange(-15_000, -50)).toBe(`${minus}150 € (${minus}5${nbsp}%)`);
  });

  it('nunca usa el guion ASCII como signo', () => {
    expect(formatPriceChange(-5_000, -56)).not.toContain('-');
  });

  it('una variación porcentual de magnitud 0 se muestra como «< 0,1 %»', () => {
    expect(formatPriceChange(-1, 0)).toBe(`${minus}0,01 € (< 0,1${nbsp}%)`);
  });

  it('sin porcentaje (precio previo 0) muestra solo el importe', () => {
    expect(formatPriceChange(5_000, null)).toBe('+50 €');
  });
});

describe('formatPriceCents — decisión 119', () => {
  it('null da el marcador de posición, nunca "null" ni "NaN"', () => {
    expect(formatPriceCents(null)).toBe('Precio no disponible');
  });

  it('convierte céntimos a euros con el formato es-ES', () => {
    expect(formatPriceCents(100000)).toBe(`${(1000).toLocaleString('es-ES')} €`);
    expect(formatPriceCents(12345678)).toBe(`${(123456.78).toLocaleString('es-ES')} €`);
  });

  it('el 0 es un precio, no un valor ausente', () => {
    expect(formatPriceCents(0)).toBe('0 €');
  });
});

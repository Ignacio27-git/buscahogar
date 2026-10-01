// ROADMAP 2.6 (decisión 119) — `formatPriceCents` compartido por la tarjeta,
// la cabecera de detalle, la lista de fuentes y las etiquetas del mapa.
import { describe, expect, it } from 'vitest';

import { formatPriceCents } from '../src/lib/format-price.js';

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

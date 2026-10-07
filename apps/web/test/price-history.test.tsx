// D.10 (decisión 178) — sección «Histórico de precios»: tabla como fuente de verdad,
// gráfico SVG escalonado solo si algún precio cambió, y texto de «sin cambios» si no.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PropertyPriceObservation } from '@buscahogar/db';

import { PriceHistory } from '../src/components/price-history.js';
import { chartAriaLabel } from '../src/lib/price-chart.js';
import { formatPriceCents } from '../src/lib/format-price.js';

function obs(
  listingId: string,
  sourceKey: string,
  priceCents: number,
  capturedAt: string,
  status = 'active'
): PropertyPriceObservation {
  return { listingId, sourceKey, status, priceCents, capturedAt: new Date(capturedAt) };
}

function render(observations: readonly PropertyPriceObservation[]): string {
  return renderToStaticMarkup(<PriceHistory observations={observations} />);
}

const TWO_LISTINGS = [
  obs('a', 'idealista', 90000, '2026-07-01T10:00:00Z'),
  obs('b', 'kyero', 88000, '2026-08-10T10:00:00Z'),
  obs('a', 'idealista', 85000, '2026-09-15T10:00:00Z'),
  obs('b', 'kyero', 87000, '2026-09-15T10:00:00Z'),
];

describe('PriceHistory', () => {
  it('sin observaciones no pinta nada', () => {
    expect(render([])).toBe('');
  });

  it('sin cambios: texto con la fecha UTC y tabla, sin <svg', () => {
    const html = render([
      obs('a', 'idealista', 30000, '2026-03-04T23:30:00Z'),
      obs('a', 'idealista', 30000, '2026-04-04T10:00:00Z'),
    ]);

    expect(html).toContain('Precio observado el 04/03/2026; aún sin cambios');
    expect(html).toContain('<table');
    expect(html).not.toContain('<svg');
  });

  it('con cambios: un svg role=img con nombre accesible y una leyenda por serie', () => {
    const html = render(TWO_LISTINGS);

    expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${chartAriaLabel(2)}"`);
    expect(html).toContain('price-chart__series--0');
    expect(html).toContain('price-chart__series--1');
    expect(html).toContain('<figcaption');
    expect(html).toMatch(/price-chart__legend[\s\S]*Idealista[\s\S]*Kyero/);
  });

  it('cabeceras en orden Fuente, Fecha, Precio, Variación, todas scope=col', () => {
    const html = render(TWO_LISTINGS);
    const headers = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);

    expect(headers).toEqual(['Fuente', 'Fecha', 'Precio', 'Variación']);
  });

  it('el pie de tabla (caption) dice que son fechas de nuestro barrido', () => {
    const html = render(TWO_LISTINGS);

    expect(html).toMatch(/<caption[^>]*>[^<]*barrido[^<]*no son fechas de publicación/);
  });

  it('filas agrupadas por anuncio (activo primero, precio actual asc) y por fecha', () => {
    const html = render(TWO_LISTINGS);
    const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1] ?? '');
    const body = rows.filter((row) => row.includes('<td'));
    const dates = body.map((row) => /(\d{2}\/\d{2}\/\d{4})/.exec(row)?.[1]);

    expect(dates).toEqual(['01/07/2026', '15/09/2026', '10/08/2026', '15/09/2026']);
    expect(body[0]).toContain('Idealista');
    expect(body[2]).toContain('Kyero');
  });

  it('variación: «—» en la primera observación y el cambio formateado en las demás', () => {
    const html = render(TWO_LISTINGS);

    expect(html).toContain('Primer precio observado');
    expect(html).toContain(`−${formatPriceCents(5000)} (−5,6 %)`);
    expect(html).toContain(`−${formatPriceCents(1000)} (−1,1 %)`);
  });

  it('«(no disponible)» solo en anuncios no activos', () => {
    const html = render([
      obs('a', 'idealista', 90000, '2026-07-01T10:00:00Z', 'removed'),
      obs('a', 'idealista', 85000, '2026-08-01T10:00:00Z', 'removed'),
      obs('b', 'kyero', 88000, '2026-08-10T10:00:00Z'),
      obs('b', 'kyero', 87000, '2026-09-10T10:00:00Z'),
    ]);

    expect(html.match(/\(no disponible\)/g)?.length).toBeGreaterThanOrEqual(1);
    const kyeroRows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map((m) => m[1] ?? '')
      .filter((row) => row.includes('Kyero'));
    expect(kyeroRows.length).toBeGreaterThan(0);
    for (const row of kyeroRows) {
      expect(row).not.toContain('(no disponible)');
    }
  });

  it('clave de fuente desconocida: «Otra fuente» y nunca la clave', () => {
    const html = render([
      obs('a', 'foo', 90000, '2026-07-01T10:00:00Z'),
      obs('a', 'foo', 85000, '2026-08-01T10:00:00Z'),
    ]);

    expect(html).toContain('Otra fuente');
    expect(html).not.toContain('foo');
  });

  it('un anuncio de una sola observación aparece en la tabla con un marcador sin línea', () => {
    const html = render([
      obs('a', 'idealista', 90000, '2026-07-01T10:00:00Z'),
      obs('b', 'kyero', 88000, '2026-08-10T10:00:00Z'),
      obs('b', 'kyero', 87000, '2026-09-10T10:00:00Z'),
    ]);

    expect(html.match(/<path[^>]*class="price-chart__line/g)).toHaveLength(1);
    expect(html).toContain('Idealista');
  });

  it('no emite atributos style (CSP)', () => {
    expect(render(TWO_LISTINGS)).not.toContain('style=');
    expect(render([obs('a', 'idealista', 1, '2026-01-01T00:00:00Z')])).not.toContain('style=');
  });
});

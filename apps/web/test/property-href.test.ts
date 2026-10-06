// ROADMAP 1.12 (diseño D9, decisión 061) — función pura: construye el href
// de la página de detalle a partir de un `listingId`. Extraída de la JSX
// porque una ruta es una preocupación de `apps/web`, nunca del dominio
// (`packages/core` no debe conocer formas de ruta).
import { describe, expect, it } from 'vitest';

import { appendSearchReturn, buildPropertyDetailHref } from '../src/lib/property-href.js';
import { pickSearchReturnParams } from '../src/lib/search-return-params.js';

describe('buildPropertyDetailHref — D9', () => {
  it('construye /properties/{listingId}', () => {
    expect(buildPropertyDetailHref('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/properties/550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('es determinista para el mismo listingId', () => {
    const id = 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789';
    expect(buildPropertyDetailHref(id)).toBe(buildPropertyDetailHref(id));
  });
});

// D.9 (decisión 171) — composición única del enlace con los parámetros de vuelta.
describe('appendSearchReturn / buildPropertyDetailHref con parámetros — D.9', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';

  it('sin parámetros devuelve la ruta plana', () => {
    expect(appendSearchReturn(`/properties/${id}`, [])).toBe(`/properties/${id}`);
    expect(buildPropertyDetailHref(id, [])).toBe(`/properties/${id}`);
  });

  it('fila de lista: lleva los filtros y page', () => {
    const params = pickSearchReturnParams(
      { operation: 'sale', minPrice: '100000', sort: 'price', dir: 'asc', view: 'list', page: '3', q: 'foo' },
      { includePage: true }
    );
    expect(buildPropertyDetailHref(id, params)).toBe(
      `/properties/${id}?operation=sale&minPrice=100000&sort=price&dir=asc&view=list&page=3`
    );
  });

  it('popup del mapa: compone sobre la ruta del punto con el polígono codificado y sin page', () => {
    const params = pickSearchReturnParams(
      { operation: 'sale', polygon: '40.1,-3.2;40.2,-3.3;40.3,-3.1', view: 'map', page: '2', zoneQuery: 'x' },
      { includePage: false }
    );
    const href = appendSearchReturn(`/properties/${id}`, params);
    expect(href.startsWith(`/properties/${id}?operation=sale&polygon=`)).toBe(true);
    expect(href).not.toContain('page=');
    expect(href).not.toContain('zoneQuery');
    expect(new URL(href, 'http://x').searchParams.get('polygon')).toBe('40.1,-3.2;40.2,-3.3;40.3,-3.1');
  });
});

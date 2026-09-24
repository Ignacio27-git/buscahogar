// ROADMAP 1.12 (diseño D3/D6; arbitraje obs #193 AR-5) — una fila por
// anuncio de origen, precio propio, enlace de salida, y el recuento de
// fotos como cifra FECHADA junto a `lastSeenAt` (nunca un número vivo suelto
// — D6, AR-5: `numPhotos` es identity-column, congelada en el primer
// avistamiento).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertyDetailSource } from '@buscahogar/db';

import { SourceList } from '../src/components/source-list.js';

function makeSource(overrides: Partial<PropertyDetailSource>): PropertyDetailSource {
  return {
    listingId: 'aaaaaaaa-0000-0000-0000-000000000001',
    sourceKey: 'idealista',
    url: 'https://www.idealista.com/inmueble/1',
    priceCents: 100000,
    thumbnailUrl: 'https://img4.idealista.com/1.jpg',
    numPhotos: 46,
    status: 'active',
    lastSeenAt: new Date('2026-09-10T00:00:00Z'),
    propertyType: 'flat',
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    floor: '3',
    address: 'Calle Mayor 1',
    ...overrides,
  };
}

describe('SourceList (D3/D6, AR-5) — cada fuente con su propio precio y enlace', () => {
  it('dos fuentes con precios distintos aparecen en filas independientes, cada precio junto a su propia fuente', () => {
    const sources = [
      makeSource({ listingId: 'l1', sourceKey: 'idealista', priceCents: 10000000 }),
      makeSource({ listingId: 'l2', sourceKey: 'fotocasa', priceCents: 12000000 }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1]);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('idealista');
    // `.toLocaleString('es-ES')` con la regla CLDR "min2" (Node 22, ICU
    // completo) solo antepone el separador de miles cuando quedan ≥2
    // dígitos por delante del último grupo de 3 — de ahí precios de 6 cifras
    // (`property-header.test.tsx` documenta el mismo hallazgo).
    expect(items[0]).toContain('100.000 €');
    expect(items[1]).toContain('fotocasa');
    expect(items[1]).toContain('120.000 €');
  });

  it('cada fila enlaza a listings.url de esa fuente', () => {
    const sources = [makeSource({ url: 'https://www.idealista.com/inmueble/42' })];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(html).toContain('href="https://www.idealista.com/inmueble/42"');
  });

  it('el recuento de fotos se muestra junto a una frase que lo fecha con lastSeenAt, nunca como número suelto', () => {
    const sources = [makeSource({ numPhotos: 46, lastSeenAt: new Date('2026-09-10T00:00:00Z') })];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(html).toContain('46');
    expect(html).toContain('10/09/2026');
    expect(html).toMatch(/46 fotos.*10\/09\/2026/);
  });

  it('un anuncio retirado (status !== active) se marca como no disponible, pero sigue en la lista', () => {
    const sources = [makeSource({ status: 'removed' })];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(html).toContain('no disponible');
    expect(html).toContain('idealista');
  });

  it('N=1 renderiza exactamente una fila, sin mensaje de degradación', () => {
    const sources = [makeSource({})];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    const items = [...html.matchAll(/<li[^>]*>/g)];
    expect(items).toHaveLength(1);
  });
});

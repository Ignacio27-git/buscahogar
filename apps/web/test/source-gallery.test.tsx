// ROADMAP 1.12 (diseño D7, arbitraje obs #193 AR-9/AR-11) — carrusel CSS-only
// (Tailwind `snap-x`/`snap-mandatory`/`snap-center`, nunca CSS a mano tras
// AR-11), navegable sin JavaScript mediante anclas de página (misma clase de
// prueba MANUAL ACCEPTANCE para el desplazamiento real — aquí solo se
// verifica lo EJECUTABLE: una imagen por fuente con `width`/`height`
// explícitos, y que ningún ancla apunte a un id de slide inexistente).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertyDetailSource } from '@buscahogar/db';

import { SourceGallery } from '../src/components/source-gallery.js';

function makeSource(overrides: Partial<PropertyDetailSource>): PropertyDetailSource {
  return {
    listingId: 'aaaaaaaa-0000-0000-0000-000000000001',
    sourceKey: 'idealista',
    url: 'https://www.idealista.com/inmueble/1',
    priceCents: 100000,
    thumbnailUrl: 'https://img4.idealista.com/1.jpg',
    numPhotos: 10,
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

describe('SourceGallery (D7/AR-11) — N imágenes, N=1 sin navegación colgante', () => {
  it('renderiza una <Image> por cada fuente con thumbnail, cada una con width/height explícitos', () => {
    const sources = [
      makeSource({ listingId: 'l1', thumbnailUrl: 'https://img4.idealista.com/1.jpg' }),
      makeSource({ listingId: 'l2', thumbnailUrl: 'https://img4.idealista.com/2.jpg' }),
      makeSource({ listingId: 'l3', thumbnailUrl: 'https://img4.idealista.com/3.jpg' }),
    ];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    const imgMatches = [...html.matchAll(/<img[^>]*>/g)];
    expect(imgMatches).toHaveLength(3);
    for (const [imgTag] of imgMatches) {
      expect(imgTag).toMatch(/width="\d+"/);
      expect(imgTag).toMatch(/height="\d+"/);
    }
  });

  it('con exactamente una imagen, no renderiza ningún ancla de navegación', () => {
    const sources = [makeSource({ listingId: 'l1' })];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    expect(html).not.toContain('<a ');
  });

  it('con varias imágenes, ningún href de navegación apunta a un id de slide inexistente', () => {
    const sources = [
      makeSource({ listingId: 'l1' }),
      makeSource({ listingId: 'l2' }),
      makeSource({ listingId: 'l3' }),
    ];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    const slideIds = [...html.matchAll(/id="(source-slide-[^"]+)"/g)].map((match) => match[1]);
    const hrefTargets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);

    expect(slideIds.length).toBeGreaterThan(0);
    for (const target of hrefTargets) {
      expect(slideIds).toContain(target);
    }
  });

  it('una fuente sin thumbnail no genera una <Image> rota', () => {
    const sources = [makeSource({ listingId: 'l1', thumbnailUrl: null })];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    expect(html).not.toContain('<img');
  });
});

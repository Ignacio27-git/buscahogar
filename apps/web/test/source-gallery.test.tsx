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
  it('renderiza una <Image> por fuente con thumbnail, con fill y sizes dentro de una caja 4:3', () => {
    const sources = [
      makeSource({ listingId: 'l1', thumbnailUrl: 'https://img4.idealista.com/1.jpg' }),
      makeSource({ listingId: 'l2', thumbnailUrl: 'https://img4.idealista.com/2.jpg' }),
      makeSource({ listingId: 'l3', thumbnailUrl: 'https://img4.idealista.com/3.jpg' }),
    ];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    const imgMatches = [...html.matchAll(/<img[^>]*>/g)];
    expect(imgMatches).toHaveLength(3);
    for (const [imgTag] of imgMatches) {
      expect(imgTag).toContain('data-nimg="fill"');
      expect(imgTag).toContain('sizes="(min-width: 64rem) 48rem, 100vw"');
      expect(imgTag).not.toMatch(/\swidth="/);
      expect(imgTag).not.toContain('fetchPriority');
    }
    expect(html.match(/relative aspect-\[4\/3\] overflow-hidden/g)).toHaveLength(3);
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

  // D.9 (decisión 172) — región con patrón de carrusel de la APG, pie visible y alt con la fuente.
  it('es una región con nombre y roledescription «carrusel», sin avance automático', () => {
    const html = renderToStaticMarkup(<SourceGallery sources={[makeSource({ listingId: 'l1' })]} />);

    expect(html).toContain('aria-roledescription="carrusel"');
    expect(html).toContain('aria-label="Fotos de la vivienda"');
    expect(html).toContain('<section');
  });

  it('la foto 2 de 3 lleva su pie, su alt con la fuente y anclas a las dos vecinas', () => {
    const sources = [
      makeSource({ listingId: 'l1' }),
      makeSource({ listingId: 'l2', sourceKey: 'idealista' }),
      makeSource({ listingId: 'l3' }),
    ];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);
    const start = html.indexOf('id="source-slide-l2"');
    const middle = html.slice(start, html.indexOf('id="source-slide-l3"'));

    expect(html).toContain('Foto 2 de 3 · Idealista');
    expect(html).toContain('alt="Foto del anuncio de Idealista"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-roledescription="diapositiva"');
    expect(middle).toContain('href="#source-slide-l1"');
    expect(middle).toContain('href="#source-slide-l3"');
    expect(html).toContain('>Foto anterior<');
    expect(html).toContain('>Foto siguiente<');
  });

  it('los extremos no tienen ancla hacia fuera y los controles no son un <nav>', () => {
    const sources = [makeSource({ listingId: 'l1' }), makeSource({ listingId: 'l2' })];
    const html = renderToStaticMarkup(<SourceGallery sources={sources} />);

    expect(html).not.toContain('<nav');
    expect(html.match(/Foto anterior/g)).toHaveLength(1);
    expect(html.match(/Foto siguiente/g)).toHaveLength(1);
  });

  it('una clave sin rótulo nombra la foto con «Otra fuente»', () => {
    const html = renderToStaticMarkup(<SourceGallery sources={[makeSource({ listingId: 'l1', sourceKey: 'foo' })]} />);

    expect(html).toContain('Foto 1 de 1 · Otra fuente');
    expect(html).not.toContain('foo');
  });
});

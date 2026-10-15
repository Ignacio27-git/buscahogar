// ROADMAP 1.12 y D.12 (decisión 180) — una fila por anuncio de origen, precio
// propio, enlace de salida y el recuento de fotos como cifra FECHADA junto a
// `lastSeenAt` (nunca un número vivo suelto — D6, AR-5: `numPhotos` es
// identity-column, congelada en el primer avistamiento). D.12 añade la
// comparación: «Más económico» / «Último precio más bajo», el aviso sin anuncios
// activos y la nota de agrupación.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertyDetailSource } from '@buscahogar/db';

import { SourceList } from '../src/components/source-list.js';

function makeSource(overrides: Partial<PropertyDetailSource>): PropertyDetailSource {
  return {
    listingId: 'aaaaaaaa-0000-0000-0000-000000000001',
    sourceKey: 'idealista',
    url: 'https://www.idealista.com/inmueble/1',
    priceCents: 10000000,
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

function rowsOf(html: string): string[] {
  return [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1] ?? '');
}

describe('SourceList (D3/D6, AR-5) — cada fuente con su propio precio y enlace', () => {
  it('dos fuentes con precios distintos aparecen en filas independientes, cada precio junto a su propia fuente', () => {
    const sources = [
      makeSource({ listingId: 'l1', sourceKey: 'idealista', priceCents: 10000000 }),
      makeSource({ listingId: 'l2', sourceKey: 'kyero', priceCents: 12000000 }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    const items = rowsOf(html);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Idealista');
    // `.toLocaleString('es-ES')` con la regla CLDR "min2" (Node 22, ICU
    // completo) solo antepone el separador de miles cuando quedan ≥2
    // dígitos por delante del último grupo de 3 — de ahí precios de 6 cifras
    // (`property-header.test.tsx` documenta el mismo hallazgo).
    expect(items[0]).toContain('100.000 €');
    expect(items[1]).toContain('Kyero');
    expect(items[1]).toContain('120.000 €');
  });

  it('cada fila enlaza a listings.url de esa fuente', () => {
    const sources = [makeSource({ url: 'https://www.idealista.com/inmueble/42' })];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(html).toContain('href="https://www.idealista.com/inmueble/42"');
  });

  it('cada fila etiqueta Precio, Fotos, Visto por última vez y Estado', () => {
    const sources = [
      makeSource({ numPhotos: 46, lastSeenAt: new Date('2026-09-10T00:00:00Z'), status: 'active' }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(html).toContain('<dl class="source-row__facts">');
    expect(html).toMatch(/<dt>Precio<\/dt><dd[^>]*>100\.000 €<\/dd>/);
    expect(html).toMatch(/<dt>Fotos<\/dt><dd[^>]*>46<\/dd>/);
    expect(html).toMatch(/<dt>Visto por última vez<\/dt><dd[^>]*>10\/09\/2026<\/dd>/);
    expect(html).toMatch(/<dt>Estado<\/dt><dd[^>]*>Disponible<\/dd>/);
  });

  it('un anuncio sin recuento de fotos muestra «Sin datos» y no inventa una cifra', () => {
    const html = renderToStaticMarkup(
      <SourceList sources={[makeSource({ numPhotos: null, status: 'removed' })]} />
    );

    expect(html).toMatch(/<dt>Fotos<\/dt><dd[^>]*>Sin datos<\/dd>/);
    expect(html).not.toMatch(/<dt>Fotos<\/dt><dd[^>]*>\d/);
    expect(html).toMatch(/<dt>Precio<\/dt><dd[^>]*>100\.000 €<\/dd>/);
    expect(html).toMatch(/<dt>Visto por última vez<\/dt><dd[^>]*>10\/09\/2026<\/dd>/);
  });

  it.each([
    ['active', 'Disponible'],
    ['inactive', 'No disponible'],
    ['removed', 'No disponible'],
    ['pending-review', 'No disponible'],
    ['toString', 'No disponible'],
  ])('el estado «%s» se muestra como «%s»', (status, label) => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({ status })]} />);

    expect(html).toMatch(new RegExp(`<dt>Estado</dt><dd[^>]*>${label}</dd>`));
  });

  it('un anuncio retirado sigue en la lista, con el mismo estado que uno inactivo y sin insignia entre paréntesis', () => {
    const sources = [makeSource({ listingId: 'a' }), makeSource({ listingId: 'b', status: 'removed' })];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    expect(rowsOf(html)).toHaveLength(2);
    expect(html).not.toContain('(no disponible)');
    expect(html).toMatch(/<dt>Estado<\/dt><dd[^>]*>No disponible<\/dd>/);
    expect(html).not.toContain('Retirado');
  });

  it('N=1 renderiza exactamente una fila, sin mensaje de degradación', () => {
    const sources = [makeSource({})];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);

    const items = [...html.matchAll(/<li[^>]*>/g)];
    expect(items).toHaveLength(1);
  });

  it('una clave sin rótulo muestra «Otra fuente», nunca la clave cruda', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({ sourceKey: 'foo' })]} />);

    expect(html).toContain('Otra fuente');
    expect(html).not.toContain('foo');
  });

  it('el enlace saliente dice «Ver en {Fuente}», es de la misma pestaña y lleva rel=external', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);

    expect(html).toContain('rel="external"');
    expect(html).not.toContain('target=');
    expect(html).toContain('Ver en Idealista');
    expect(html).toContain('(web externa)');
  });

  it('el enlace saliente lleva un svg decorativo en vez de ↗ y su nombre sigue completo', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    const anchor = html.match(/<a [^>]*>.*?<\/a>/)?.[0] ?? '';

    expect(anchor).toMatch(/<svg class="icon ms-1"[^>]*aria-hidden="true"/);
    expect(html).not.toContain('↗');
    // Nombre accesible = texto del enlace sin las etiquetas (el svg aporta cadena vacía).
    expect(anchor.replace(/<[^>]+>/g, '')).toBe('Ver en Idealista (web externa)');
  });

  it('la fecha de «Visto por última vez» usa cifras tabulares', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    expect(html).toContain('<dd class="tabular-nums">10/09/2026</dd>');
  });

  it('tiene un encabezado de sección que nombra la lista', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);

    expect(html).toContain('<section class="source-list" aria-labelledby="anuncios-de-origen">');
    expect(html).toContain('id="anuncios-de-origen"');
  });
});

describe('SourceList (D.12) — comparación de anuncios', () => {
  it('el anuncio activo más barato lleva «Más económico»; el resto no', () => {
    const sources = [
      makeSource({ listingId: 'l1', priceCents: 8_700_000, sourceKey: 'idealista' }),
      makeSource({ listingId: 'l2', priceCents: 8_500_000, sourceKey: 'kyero' }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);
    const items = rowsOf(html);

    expect(items[0]).not.toContain('Más económico');
    expect(items[1]).toContain('Más económico');
    expect(html).not.toContain('Último precio más bajo');
    expect(html).not.toContain('Precio más bajo');
  });

  it('un único anuncio activo también lleva «Más económico»', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);

    expect(html.match(/Más económico/g)).toHaveLength(1);
  });

  it('un empate destaca todas las filas empatadas', () => {
    const sources = [
      makeSource({ listingId: 'l1', priceCents: 8_500_000 }),
      makeSource({ listingId: 'l2', priceCents: 8_500_000, sourceKey: 'kyero' }),
      makeSource({ listingId: 'l3', priceCents: 9_000_000, sourceKey: 'fotocasa' }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);
    const items = rowsOf(html);

    expect(html.match(/Más económico/g)).toHaveLength(2);
    expect(items[2]).not.toContain('Más económico');
  });

  it('un activo más caro que un retirado sigue siendo el destacado', () => {
    const sources = [
      makeSource({ listingId: 'l1', priceCents: 9_000_000 }),
      makeSource({ listingId: 'l2', priceCents: 7_000_000, status: 'removed', sourceKey: 'kyero' }),
    ];
    const items = rowsOf(renderToStaticMarkup(<SourceList sources={sources} />));

    expect(items[0]).toContain('Más económico');
    expect(items[1]).not.toContain('Más económico');
  });

  it('la insignia queda fuera del enlace saliente', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    const anchor = html.match(/<a [^>]*>.*?<\/a>/)?.[0] ?? '';

    expect(anchor).toContain('Ver en Idealista');
    expect(anchor).not.toContain('Más económico');
    expect(html).toContain('<strong class="source-row__highlight source-row__highlight--active">Más económico</strong>');
  });

  it('sin ningún anuncio activo avisa sobre la lista y marca «Último precio más bajo», nunca «Más económico»', () => {
    const sources = [
      makeSource({ listingId: 'l1', status: 'inactive', priceCents: 9_000_000 }),
      makeSource({ listingId: 'l2', status: 'removed', priceCents: 7_500_000, sourceKey: 'kyero' }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);
    const items = rowsOf(html);

    const warning =
      'Ninguno de estos anuncios sigue disponible. Mostramos el más bajo de sus últimos precios.';
    expect(html).toContain(`<p class="source-list__warning">${warning}</p>`);
    expect(html.indexOf(warning)).toBeLessThan(html.indexOf('<ul'));
    // D.18 (decisión 221): sin anuncios activos la insignia es «Último precio más bajo».
    expect(html.match(/Último precio más bajo/g)).toHaveLength(1);
    expect(items[1]).toContain('<strong class="source-row__highlight">Último precio más bajo</strong>');
    expect(items[0]).not.toContain('Último precio más bajo');
    expect(html).not.toContain('Más económico');
    expect(html).not.toContain('Precio más bajo');
  });

  it('con algún anuncio activo no muestra el aviso', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);

    expect(html).not.toContain('source-list__warning');
    expect(html).not.toContain('Ninguno de estos anuncios');
  });

  it('una lista vacía no muestra aviso ni insignia', () => {
    const html = renderToStaticMarkup(<SourceList sources={[]} />);

    expect(html).toContain('id="anuncios-de-origen"');
    expect(html).not.toContain('source-list__warning');
    expect(html).not.toContain('Más económico');
    expect(html).not.toContain('Último precio más bajo');
  });

  it('la nota de agrupación se muestra siempre bajo el h2, con uno o varios anuncios', () => {
    const note =
      '<p class="source-list__note">Agrupamos estos anuncios porque creemos que describen la misma vivienda. Compruébalo en cada fuente.</p>';
    const one = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    const many = renderToStaticMarkup(
      <SourceList sources={[makeSource({ listingId: 'l1' }), makeSource({ listingId: 'l2' })]} />
    );

    for (const html of [one, many]) {
      expect(html).toContain(note);
      expect(html.indexOf('</h2>')).toBeLessThan(html.indexOf(note));
      expect(html.indexOf(note)).toBeLessThan(html.indexOf('<ul'));
    }
  });
});

// D.19 (decisión 231) — el verde marca solo estados favorables y nunca es la única señal: el texto
// «Más económico» y «Disponible» se conserva en cada caso.
describe('SourceList (D.19) — claves de estado favorable', () => {
  it('«Más económico» lleva el modificador --active y «Último precio más bajo» no', () => {
    const active = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    expect(active).toContain('source-row__highlight source-row__highlight--active">Más económico<');

    const none = renderToStaticMarkup(
      <SourceList sources={[makeSource({ status: 'removed' }), makeSource({ listingId: 'l2', status: 'inactive', priceCents: 9_000_000 })]} />
    );
    expect(none).toContain('Último precio más bajo');
    expect(none).not.toContain('source-row__highlight--active');
  });

  it('solo las filas más baratas llevan el modificador, igual que el texto', () => {
    const sources = [
      makeSource({ listingId: 'l1', priceCents: 8_500_000 }),
      makeSource({ listingId: 'l2', priceCents: 9_000_000, sourceKey: 'kyero' }),
    ];
    const html = renderToStaticMarkup(<SourceList sources={sources} />);
    const items = rowsOf(html);
    expect(items[0]).toContain('source-row__highlight--active');
    expect(items[1]).not.toContain('source-row__highlight');
    expect(html.match(/source-row__highlight--active/g)).toHaveLength(1);
  });

  it('el estado «Disponible» lleva la clase de estado favorable con su texto', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({ status: 'active' })]} />);
    expect(html).toContain('<dd class="source-row__status--available">Disponible</dd>');
  });

  it.each(['inactive', 'removed', 'pending-review'])(
    'el estado «%s» no lleva la clase favorable ni dice «Disponible»',
    (status) => {
      const html = renderToStaticMarkup(<SourceList sources={[makeSource({ status })]} />);
      expect(html).toContain('<dt>Estado</dt><dd>No disponible</dd>');
      expect(html).not.toContain('source-row__status--available');
    }
  );

  it('el precio y la fecha de la fila llevan cifras tabulares', () => {
    const html = renderToStaticMarkup(<SourceList sources={[makeSource({})]} />);
    expect(html).toContain('<dd class="source-row__price tabular-nums">100.000 €</dd>');
  });
});

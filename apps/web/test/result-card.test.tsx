// ROADMAP 1.12 (diseño D4/D9; arbitraje obs #193 AR-4) — el ancla es
// `string | null` (`min(listingId)` sobre un conjunto de miembros vacío da
// NULL en SQL): la tarjeta enlaza cuando hay ancla y degrada a la tarjeta de
// hoy (sin enlace) cuando no la hay — nunca un `href` roto o vacío.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertySearchResult } from '@buscahogar/db';

import { ResultCard } from '../src/components/result-card.js';

function makeResult(overrides: Partial<PropertySearchResult>): PropertySearchResult {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    operation: 'sale',
    propertyType: 'flat',
    minPriceCents: 100000,
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    address: 'Calle Mayor 1',
    floor: '3',
    title: 'Piso',
    description: null,
    thumbnailUrl: null,
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    distinctSourceCount: 1,
    anchorListingId: null,
    ...overrides,
  };
}

describe('ResultCard (D4/D9, AR-4) — enlace condicionado al ancla', () => {
  it('con ancla presente, la raíz es (o envuelve) un <a href="/properties/{anchor}">', () => {
    const result = makeResult({ anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002' });
    const html = renderToStaticMarkup(<ResultCard result={result} />);

    expect(html).toContain('href="/properties/bbbbbbbb-0000-0000-0000-000000000002"');
  });

  it('D.9: con returnParams el enlace lleva los parámetros de búsqueda', () => {
    const result = makeResult({ anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002' });
    const html = renderToStaticMarkup(
      <ResultCard
        result={result}
        returnParams={[
          ['operation', 'sale'],
          ['page', '3'],
        ]}
      />
    );

    expect(html).toContain('href="/properties/bbbbbbbb-0000-0000-0000-000000000002?operation=sale&amp;page=3"');
  });

  it('con ancla null, degrada exactamente a la tarjeta de hoy — sin <a>', () => {
    const result = makeResult({ anchorListingId: null });
    const html = renderToStaticMarkup(<ResultCard result={result} />);

    expect(html).not.toContain('<a ');
  });

  it('el texto "Disponible en N fuentes" no cambia en ninguna de las dos ramas', () => {
    const linked = renderToStaticMarkup(
      <ResultCard result={makeResult({ anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002', distinctSourceCount: 2 })} />
    );
    const plain = renderToStaticMarkup(<ResultCard result={makeResult({ anchorListingId: null, distinctSourceCount: 2 })} />);

    expect(linked).toContain('Disponible en 2 fuentes');
    expect(plain).toContain('Disponible en 2 fuentes');
  });
});

// D.6b (spec search-result-card) — fila densa: rótulos en español, imagen con
// `next/image` en una caja de proporción fija, política de alt y un único enlace.
const ANCHOR = 'bbbbbbbb-0000-0000-0000-000000000002';
const THUMB = 'https://img4.idealista.com/blur/foto.webp';

function render(overrides: Partial<PropertySearchResult> = {}): string {
  return renderToStaticMarkup(<ResultCard result={makeResult({ anchorListingId: ANCHOR, ...overrides })} />);
}

describe('ResultCard D.6b — contenido y rótulos (S1-S5)', () => {
  it('S1: tipo y operación como «Piso · Venta», sin los valores crudos', () => {
    const html = render({ propertyType: 'flat', operation: 'sale' });
    expect(html).toContain('Piso · Venta');
    expect(html).not.toContain('flat');
    expect(html).not.toContain('sale');
  });

  it('S1 (triangulación): «Casa · Alquiler», sin `house` ni `rent`', () => {
    const html = render({ propertyType: 'house', operation: 'rent' });
    expect(html).toContain('Casa · Alquiler');
    expect(html).not.toContain('house');
    expect(html).not.toContain('rent');
  });

  it('S2: tipo y operación null muestran las dos reservas', () => {
    const html = render({ propertyType: null, operation: null });
    expect(html).toContain('Tipo no disponible');
    expect(html).toContain('Operación no disponible');
  });

  it('S2: un valor desconocido tampoco se muestra crudo', () => {
    const html = render({ propertyType: 'castle', operation: 'barter' });
    expect(html).toContain('Tipo no disponible · Operación no disponible');
    expect(html).not.toContain('castle');
    expect(html).not.toContain('barter');
  });

  it('S3: «Disponible en 1 fuente» y «Disponible en 3 fuentes»', () => {
    expect(render({ distinctSourceCount: 1 })).toContain('Disponible en 1 fuente<');
    expect(render({ distinctSourceCount: 3 })).toContain('Disponible en 3 fuentes<');
  });

  it('S4: precio null muestra «Precio no disponible»; con precio, el importe', () => {
    expect(render({ minPriceCents: null })).toContain('Precio no disponible');
    expect(render({ minPriceCents: 25000000 })).toContain('250.000 €');
  });

  it('S5: «1 baño» en singular y «2 baños» en plural', () => {
    expect(render({ bathrooms: 1 })).toContain('1 baño<');
    expect(render({ bathrooms: 2 })).toContain('2 baños');
  });

  it('las cifras de comparación llevan tabular-nums', () => {
    expect(render()).toMatch(/class="[^"]*tabular-nums[^"]*"[^>]*>90 m²/);
  });
});

describe('ResultCard D.6b — imagen y alt (S6-S8)', () => {
  it('con miniatura usa next/image con `sizes`, sin width/height fijos ni unoptimized', () => {
    const html = render({ thumbnailUrl: THUMB });
    expect(html).toContain('<img');
    expect(html).toContain('sizes="(min-width: 48rem) 10rem, 6rem"');
    expect(html).not.toContain('width="480"');
    expect(html).not.toContain('fetchPriority');
    expect(html).not.toContain('Sin foto');
  });

  it('S6: tipo, operación y dirección presentes dan alt vacío', () => {
    expect(render({ thumbnailUrl: THUMB })).toContain('alt=""');
  });

  it('S7: sin dirección el alt es «Foto de la vivienda»', () => {
    const html = render({ thumbnailUrl: THUMB, address: null });
    expect(html).toContain('alt="Foto de la vivienda"');
  });

  it('S7: sin tipo el alt es «Foto de la vivienda»', () => {
    expect(render({ thumbnailUrl: THUMB, propertyType: null })).toContain('alt="Foto de la vivienda"');
  });

  it('S8: sin miniatura no hay imagen y «Sin foto» va oculto a lectores', () => {
    const html = render({ thumbnailUrl: null });
    expect(html).not.toContain('<img');
    expect(html).toMatch(/<[a-z]+ [^>]*aria-hidden="true"[^>]*>Sin foto</);
  });
});

describe('ResultCard D.6b — enlace único (S10)', () => {
  it('S10: ancla null, ningún <a>; con ancla, exactamente uno', () => {
    expect(renderToStaticMarkup(<ResultCard result={makeResult({ anchorListingId: null })} />)).not.toContain('<a ');
    expect(render().match(/<a /g)).toHaveLength(1);
  });

  it('el nombre del enlace nunca queda vacío aunque falten todos los datos', () => {
    const html = render({
      thumbnailUrl: THUMB,
      propertyType: null,
      operation: null,
      address: null,
      minPriceCents: null,
      surfaceM2: null,
      rooms: null,
      bathrooms: null,
    });
    const link = /<a [^>]*>(.*)<\/a>/s.exec(html)?.[1] ?? '';
    const visibleText = link.replace(/<[^>]+>/g, '').trim();
    expect(visibleText).toContain('Precio no disponible');
    expect(visibleText).toContain('Tipo no disponible');
  });
});

// D.15 (F6, R11, decisión 198) — el encabezado del resultado lleva más que el precio: la lista de
// encabezados de un lector de pantalla ("12 000 €, 12 000 €...") no distinguía unos de otros.
describe('ResultCard D.15 — encabezado con contexto (F6)', () => {
  const headingOf = (html: string): string => /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? '';

  it('el h2 incluye el tipo y la operación tras el precio, en texto solo para lectores', () => {
    const heading = headingOf(render({ propertyType: 'flat', operation: 'sale' }));
    expect(heading).toContain('<span class="sr-only">, Piso · Venta</span>');
    expect(heading.indexOf('100')).toBeLessThan(heading.indexOf('Piso'));
  });

  it('triangulación: «Casa · Alquiler» y las reservas cuando faltan los datos', () => {
    expect(headingOf(render({ propertyType: 'house', operation: 'rent' }))).toContain(
      ', Casa · Alquiler</span>'
    );
    expect(headingOf(render({ propertyType: null, operation: null }))).toContain(
      ', Tipo no disponible · Operación no disponible</span>'
    );
  });
});

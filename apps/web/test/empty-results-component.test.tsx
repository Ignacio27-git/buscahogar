// D.14 (decisión 190) — marcado de `EmptyResults`: tres tipos, tuteo, enlaces «Quitar» y el
// nombre accesible del enlace de limpieza (WCAG 3.2.4: mismo nombre = mismo destino).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyResults } from '../src/components/empty-results.js';
import { buildFirstPageHref } from '../src/lib/search-href.js';

const IMPERSONAL = /\bSe (ha|han|pudo|produjo|encontraron)\b/;
const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function linkNames(html: string): string[] {
  return [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((match) => text(match[1] ?? ''));
}

// D.18 (decisión 225, C-11): el vacío filtrado ya no repite los chips. Estado, la frase que remite a
// los chips de arriba y UNA acción siempre visible. Sin lista de «Quitar «X»».
describe('EmptyResults — filtered', () => {
  const params = { operation: 'sale', propertyType: 'flat', view: 'map', sort: 'price', page: '1' };
  const html = renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={[]} />);

  it('estado, frase que remite a los chips y exactamente un enlace, en tuteo', () => {
    expect(text(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(text(html)).toContain('Los filtros aplicados están arriba; pulsa uno para quitarlo');
    expect(text(html)).not.toContain('Prueba a quitar alguno de estos filtros');
    expect(linkNames(html)).toEqual(['Quitar todos los filtros']);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('no repite los chips: ningún enlace «Quitar «…»»', () => {
    expect(html).not.toContain('Quitar «');
    expect(html).not.toContain('Operación: Venta');
  });

  it('«Quitar todos los filtros» sin nada que conservar apunta a view y sort, dentro de su párrafo', () => {
    expect(html).toContain(
      '<p class="empty-results__action"><a href="/?view=map&amp;sort=price">Quitar todos los filtros</a></p>'
    );
    expect(html).not.toContain('empty-results__actions');
  });

  it('con un solo filtro también ofrece la acción (C-11: siempre visible)', () => {
    const one = renderToStaticMarkup(<EmptyResults kind="filtered" params={{ operation: 'sale' }} keepOnClear={[]} />);

    expect(linkNames(one)).toEqual(['Quitar todos los filtros']);
    expect(one).toContain('href="/"');
  });

  it('no declara un rol vivo: el aviso de cobertura es la única región', () => {
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });
});

describe('EmptyResults — acción que conserva el polígono (WCAG 3.2.4)', () => {
  const params = { view: 'map', polygon: POLYGON, operation: 'sale', propertyType: 'flat' };

  it('con polígono conservado se llama «Quitar los demás filtros» y mantiene el polígono', () => {
    const html = renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={['polygon']} />);
    const encoded = new URLSearchParams({ polygon: POLYGON }).toString();

    expect(linkNames(html)).toEqual(['Quitar los demás filtros']);
    expect(html).toContain(`href="/?view=map&amp;${encoded.replaceAll('&', '&amp;')}">Quitar los demás filtros</a>`);
    expect(html).toContain('<p class="empty-results__action">');
  });

  it('con un solo filtro más el polígono sigue habiendo una acción', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="filtered" params={{ polygon: POLYGON, operation: 'sale' }} keepOnClear={['polygon']} />
    );

    expect(linkNames(html)).toEqual(['Quitar los demás filtros']);
  });
});

describe('EmptyResults — unfiltered y past-last-page', () => {
  it('unfiltered: mensaje propio, sin enlaces', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="unfiltered" params={{}} keepOnClear={[]} />
    );

    expect(text(html)).toContain('Todavía no hay viviendas.');
    expect(text(html)).toContain(
      'Aquí verás las viviendas de los portales en cuanto las incorporemos. Vuelve a buscar más tarde.'
    );
    expect(linkNames(html)).toEqual([]);
  });

  it('past-last-page: enlace a la primera página sin `page` y con los filtros', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="past-last-page" params={{ operation: 'sale', page: '99' }} keepOnClear={[]} />
    );

    expect(text(html)).toContain('Esta página ya no tiene viviendas.');
    expect(text(html)).toContain('Los resultados de tu búsqueda terminan antes de esta página.');
    expect(html).toContain('href="/?operation=sale">Ir a la primera página</a>');
    expect(linkNames(html)).toEqual(['Ir a la primera página']);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });
});

describe('buildFirstPageHref', () => {
  it('quita `page` y conserva el resto, o devuelve `/`', () => {
    expect(buildFirstPageHref({ operation: 'sale', page: '4', tag: ['a', 'b'] })).toBe('/?operation=sale&tag=a&tag=b');
    expect(buildFirstPageHref({ page: '4' })).toBe('/');
  });
});

describe('EmptyResults — servidor y tokens', () => {
  it('es un componente de servidor', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/components/empty-results.tsx', import.meta.url)), 'utf8');

    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
  });
});

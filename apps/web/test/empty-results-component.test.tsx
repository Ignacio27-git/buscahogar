// D.14 (decisión 190) — marcado de `EmptyResults`: tres tipos, tuteo, enlaces «Quitar» y el
// nombre accesible del enlace de limpieza (WCAG 3.2.4: mismo nombre = mismo destino).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyResults } from '../src/components/empty-results.js';
import { buildFirstPageHref } from '../src/lib/search-href.js';
import type { AppliedFilter } from '../src/lib/search-labels.js';

const OPERATION: AppliedFilter = { key: 'operation', label: 'Operación: Venta' };
const TYPE: AppliedFilter = { key: 'propertyType', label: 'Tipo: Piso' };
const IMPERSONAL = /\bSe (ha|han|pudo|produjo|encontraron)\b/;
const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function linkNames(html: string): string[] {
  return [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((match) => text(match[1] ?? ''));
}

describe('EmptyResults — filtered', () => {
  const params = { operation: 'sale', propertyType: 'flat', view: 'map', sort: 'price', page: '1' };
  const html = renderToStaticMarkup(
    <EmptyResults kind="filtered" params={params} filters={[OPERATION, TYPE]} keepOnClear={[]} />
  );

  it('guía en tuteo y un enlace «Quitar» por filtro con su destino', () => {
    expect(text(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(text(html)).toContain('Prueba a quitar alguno de estos filtros:');
    expect(html).toContain('href="/?propertyType=flat&amp;view=map&amp;sort=price"');
    expect(html).toContain('href="/?operation=sale&amp;view=map&amp;sort=price"');
    expect(linkNames(html)).toEqual([
      'Quitar «Operación: Venta»',
      'Quitar «Tipo: Piso»',
      'Quitar todos los filtros',
    ]);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('«Quitar todos los filtros» sin nada que conservar apunta a view y sort', () => {
    expect(html).toContain('href="/?view=map&amp;sort=price">Quitar todos los filtros</a>');
  });

  it('con un solo filtro no ofrece «Quitar todos»', () => {
    const one = renderToStaticMarkup(
      <EmptyResults kind="filtered" params={{ operation: 'sale' }} filters={[OPERATION]} keepOnClear={[]} />
    );

    expect(linkNames(one)).toEqual(['Quitar «Operación: Venta»']);
  });

  it('no declara un rol vivo: el aviso de cobertura es la única región', () => {
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });
});

describe('EmptyResults — enlace de limpieza que conserva polígono o zona (WCAG 3.2.4)', () => {
  const params = { view: 'map', polygon: POLYGON, operation: 'sale', propertyType: 'flat' };

  it('con polígono conservado se llama «Quitar los demás filtros» y mantiene el polígono', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="filtered" params={params} filters={[OPERATION, TYPE]} keepOnClear={['polygon']} />
    );
    const encoded = new URLSearchParams({ polygon: POLYGON }).toString();

    expect(linkNames(html)).toContain('Quitar los demás filtros');
    expect(linkNames(html)).not.toContain('Quitar todos los filtros');
    expect(html).toContain(`href="/?view=map&amp;${encoded.replaceAll('&', '&amp;')}">Quitar los demás filtros</a>`);
  });

  it('con zona sin aplicar conservada mantiene zone y zoneQuery', () => {
    const html = renderToStaticMarkup(
      <EmptyResults
        kind="filtered"
        params={{ zone: '28079', zoneQuery: 'mad', operation: 'sale', propertyType: 'flat' }}
        filters={[OPERATION, TYPE]}
        keepOnClear={['zone', 'zoneQuery']}
      />
    );

    expect(html).toContain('href="/?zone=28079&amp;zoneQuery=mad">Quitar los demás filtros</a>');
  });

  it('el polígono no cuenta para el umbral: con un solo filtro acotado no hay enlace de limpieza', () => {
    const html = renderToStaticMarkup(
      <EmptyResults
        kind="filtered"
        params={{ polygon: POLYGON, operation: 'sale' }}
        filters={[OPERATION]}
        keepOnClear={['polygon']}
      />
    );

    expect(linkNames(html)).toEqual(['Quitar «Operación: Venta»']);
  });
});

describe('EmptyResults — unfiltered y past-last-page', () => {
  it('unfiltered: mensaje propio, sin enlaces', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="unfiltered" params={{}} filters={[]} keepOnClear={[]} />
    );

    expect(text(html)).toContain('Todavía no hay viviendas.');
    expect(text(html)).toContain(
      'Aquí verás las viviendas de los portales en cuanto las incorporemos. Vuelve a buscar más tarde.'
    );
    expect(linkNames(html)).toEqual([]);
  });

  it('past-last-page: enlace a la primera página sin `page` y con los filtros', () => {
    const html = renderToStaticMarkup(
      <EmptyResults
        kind="past-last-page"
        params={{ operation: 'sale', page: '99' }}
        filters={[OPERATION]}
        keepOnClear={[]}
      />
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

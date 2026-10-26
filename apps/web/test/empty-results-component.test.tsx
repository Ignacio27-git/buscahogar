// D.14 (decisión 190) y D.22 (decisión 269) — marcado de `EmptyResults`: tres tipos, tuteo cálido, una
// única acción principal y el nombre accesible del enlace de limpieza (WCAG 3.2.4: mismo nombre = mismo
// destino).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyResults } from '../src/components/empty-results.js';
import { buildFirstPageHref } from '../src/lib/search-href.js';
import { stateIllustrationSvg } from '../src/lib/state-illustrations.js';

const IMPERSONAL = /\bSe (ha|han|pudo|produjo|encontraron)\b/;
const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function linkNames(html: string): string[] {
  return [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((match) => text(match[1] ?? ''));
}

// N7: solo cuentan los elementos con la receta primaria, no los enlaces de texto.
function primaryActions(html: string): string[] {
  return [
    ...html.matchAll(/<(?:a|button) [^>]*class="[^"]*\bstate-action\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|button)>/g),
  ].map((match) => text(match[1] ?? ''));
}

// D.18 (decisión 225, C-11) y D.22 (decisión 269): el vacío filtrado no repite los chips. Estado, una frase
// cálida que remite a los chips y UNA acción principal SIEMPRE visible (D.22 enmienda la 225: antes se
// ocultaba si la fila de chips ya ofrecía «Quitar todos»; mismo nombre y mismo destino, WCAG 3.2.4).
describe('EmptyResults — filtered', () => {
  const params = { operation: 'sale', propertyType: 'flat', view: 'map', sort: 'price', page: '1' };
  const html = renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={[]} />);

  it('estado y frase cálida en tuteo, con la ilustración «empty»', () => {
    expect(text(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(text(html)).toContain('Prueba a quitar algún filtro: están arriba y basta con pulsar uno.');
    expect(text(html)).not.toContain('Los filtros aplicados están arriba');
    expect(text(html)).not.toMatch(IMPERSONAL);
    expect(html).toContain(stateIllustrationSvg('empty'));
  });

  it('una sola acción principal que apunta a view y sort, con la receta primaria', () => {
    expect(linkNames(html)).toEqual(['Quitar todos los filtros']);
    expect(html).toContain(
      '<p class="empty-results__action"><a class="state-action" href="/?view=map&amp;sort=price">Quitar todos los filtros</a></p>'
    );
    expect(primaryActions(html)).toHaveLength(1);
    expect(html).not.toContain('Quitar «');
    expect(html).not.toContain('empty-results__actions');
  });

  it('la acción se muestra siempre: ya no hay propiedad que la oculte (enmienda de la 225)', () => {
    const one = renderToStaticMarkup(<EmptyResults kind="filtered" params={{ operation: 'sale' }} keepOnClear={[]} />);
    expect(linkNames(one)).toEqual(['Quitar todos los filtros']);
    expect(one).toContain('href="/"');
  });

  it('no declara un rol vivo: el aviso de cobertura es la única región', () => {
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });
});

// Paso 3.2 (decisión 246, enmienda la 225): en una zona cubierta el vacío filtrado nombra el municipio y
// atribuye el vacío a los filtros. Mismo párrafo de detalle: sin rol vivo (160), sin segunda acción ni
// repetición de los chips (225). D.22 (decisión 269) solo cambia el tono de la frase.
describe('EmptyResults — zona cubierta sin resultados', () => {
  const params = { operation: 'sale', propertyType: 'flat', zone: '28065', minRooms: '50' };
  const covered = (coveredZone: string | null = 'Getafe'): string =>
    renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={[]} coveredZone={coveredZone} />);

  it('nombra el municipio y atribuye el vacío a los filtros, en el párrafo de detalle', () => {
    const html = covered();

    expect(text(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(html).toContain(
      '<p class="empty-results__detail">Los anuncios de Getafe están al día, así que son los filtros los que dejan la lista vacía. Prueba a quitar alguno: están arriba.</p>'
    );
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('con otro municipio cambia el nombre (no está fijado)', () => {
    expect(text(covered('Alcalá de Henares'))).toContain('Los anuncios de Alcalá de Henares están al día');
  });

  it('sin coveredZone, o con null, mantiene el detalle de siempre y no menciona «al día»', () => {
    const without = renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={[]} />);

    for (const html of [without, covered(null)]) {
      expect(text(html)).toContain('Prueba a quitar algún filtro: están arriba y basta con pulsar uno.');
      expect(text(html)).not.toContain('al día');
    }
  });

  it('no declara un rol vivo ni repite los chips', () => {
    const html = covered();

    expect(html).not.toMatch(/role="|aria-live/);
    expect(text(html)).not.toContain('Habitaciones');
    expect(text(html)).not.toContain('50');
  });

  it('la acción principal es una sola y siempre está', () => {
    expect(linkNames(covered())).toEqual(['Quitar todos los filtros']);
    expect(primaryActions(covered())).toHaveLength(1);
  });

  it('en unfiltered y past-last-page no hay aviso aunque llegue coveredZone', () => {
    for (const kind of ['unfiltered', 'past-last-page'] as const) {
      const html = renderToStaticMarkup(<EmptyResults kind={kind} params={{}} keepOnClear={[]} coveredZone="Getafe" />);
      expect(text(html)).not.toContain('Getafe');
    }
  });
});

describe('EmptyResults — acción que conserva el polígono (WCAG 3.2.4)', () => {
  const params = { view: 'map', polygon: POLYGON, operation: 'sale', propertyType: 'flat' };

  it('con polígono conservado se llama «Quitar los demás filtros» y mantiene el polígono', () => {
    const html = renderToStaticMarkup(<EmptyResults kind="filtered" params={params} keepOnClear={['polygon']} />);
    const encoded = new URLSearchParams({ polygon: POLYGON }).toString();

    expect(linkNames(html)).toEqual(['Quitar los demás filtros']);
    expect(html).toContain(`href="/?view=map&amp;${encoded.replaceAll('&', '&amp;')}">Quitar los demás filtros</a>`);
    expect(html).toContain('<p class="empty-results__action"><a class="state-action" ');
    expect(primaryActions(html)).toEqual(['Quitar los demás filtros']);
  });

  it('con un solo filtro más el polígono sigue habiendo una acción', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="filtered" params={{ polygon: POLYGON, operation: 'sale' }} keepOnClear={['polygon']} />
    );

    expect(linkNames(html)).toEqual(['Quitar los demás filtros']);
  });
});

describe('EmptyResults — unfiltered y past-last-page', () => {
  it('unfiltered: copia cálida, ilustración y una acción «Comprobar de nuevo» a la URL actual', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="unfiltered" params={{ view: 'map', sort: 'price' }} keepOnClear={[]} />
    );

    expect(text(html)).toContain('Aún no tenemos viviendas que enseñarte.');
    expect(text(html)).toContain(
      'Estamos incorporando los anuncios de los portales. Vuelve a mirar dentro de un rato.'
    );
    expect(html).toContain(stateIllustrationSvg('empty'));
    expect(linkNames(html)).toEqual(['Comprobar de nuevo']);
    expect(html).toContain('<a class="state-action" href="/?view=map&amp;sort=price">Comprobar de nuevo</a>');
    expect(primaryActions(html)).toHaveLength(1);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('past-last-page: enlace a la primera página sin `page` y con los filtros', () => {
    const html = renderToStaticMarkup(
      <EmptyResults kind="past-last-page" params={{ operation: 'sale', page: '99' }} keepOnClear={[]} />
    );

    expect(text(html)).toContain('Esta página ya no tiene viviendas.');
    expect(text(html)).toContain('Tu búsqueda termina antes de esta página.');
    expect(html).toContain('<a class="state-action" href="/?operation=sale">Ir a la primera página</a>');
    expect(linkNames(html)).toEqual(['Ir a la primera página']);
    expect(primaryActions(html)).toHaveLength(1);
    expect(html).toContain(stateIllustrationSvg('empty'));
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

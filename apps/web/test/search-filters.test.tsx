// D.6a (spec search-filters) — etiquetas de los filtros aplicados y recuentos,
// y componentes de la barra de filtros y de los filtros aplicados. Funciones
// puras y `renderToStaticMarkup`: sin red ni base de datos.
import { searchQuerySchema } from '@buscahogar/core';
import type { PropertySearchCriteria } from '@buscahogar/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppliedFilters } from '../src/components/applied-filters.js';
import { CriteriaFields } from '../src/components/criteria-fields.js';
import { FilterBar } from '../src/components/filter-bar.js';
import { canonicalizeFormSubmission } from '../src/lib/search-href.js';
import { describeAppliedFilters, formatListCount, formatMapCount } from '../src/lib/search-labels.js';

function criteria(params: Record<string, string>): PropertySearchCriteria {
  return searchQuerySchema.parse(params);
}

function labels(params: Record<string, string>, zoneName: string | null = null): string[] {
  return describeAppliedFilters(criteria(params), zoneName).map((filter) => filter.label);
}

describe('describeAppliedFilters — rótulos y orden (spec "Applied-filter chips")', () => {
  it('todos los filtros escalares, en el orden de la barra, con el valor real', () => {
    expect(
      labels({
        operation: 'sale',
        propertyType: 'flat',
        minPrice: '150000',
        maxPrice: '300000',
        minSurface: '60',
        maxSurface: '120',
        minRooms: '2',
        minBathrooms: '1',
      })
    ).toEqual([
      'Operación: Venta',
      'Tipo: Piso',
      'Precio desde 150.000 €',
      'Precio hasta 300.000 €',
      'Superficie desde 60 m²',
      'Superficie hasta 120 m²',
      'Habitaciones: 2 o más',
      'Baños: 1 o más',
    ]);
  });

  it('otra combinación: alquiler y casa, sin precio ni superficie', () => {
    expect(labels({ operation: 'rent', propertyType: 'house', minRooms: '3' })).toEqual([
      'Operación: Alquiler',
      'Tipo: Casa',
      'Habitaciones: 3 o más',
    ]);
  });

  it('sort y dir no generan filtro: sin parámetros de filtro no hay ninguno', () => {
    expect(labels({ sort: 'price', dir: 'asc' })).toEqual([]);
  });

  it('la clave de cada filtro es la que usa el constructor de href', () => {
    expect(describeAppliedFilters(criteria({ minRooms: '2', maxPrice: '900' }), null).map((f) => f.key)).toEqual([
      'maxPrice',
      'minRooms',
    ]);
  });

  it('zona con nombre resuelto', () => {
    expect(labels({ zone: '28065' }, 'Getafe')).toEqual(['Zona: Getafe']);
  });

  it('zona sin nombre resuelto: «Zona INE xxxxx»', () => {
    expect(labels({ zone: '28079' }, null)).toEqual(['Zona INE 28079']);
  });

  it('polígono dibujado: «Zona dibujada»', () => {
    expect(labels({ polygon: '40.4,-3.7;40.4,-3.6;40.5,-3.6' })).toEqual(['Zona dibujada']);
  });

  it('lat/lng/radius son UN solo filtro; menos de 1000 m se dice en metros', () => {
    const filters = describeAppliedFilters(criteria({ lat: '40.4', lng: '-3.7', radius: '500' }), null);
    expect(filters).toEqual([{ key: 'geo', label: 'A 500 m de un punto' }]);
  });

  it('desde 1000 m se dice en km, con un decimal como máximo y coma decimal', () => {
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '5000' })).toEqual(['A 5 km de un punto']);
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '1500' })).toEqual(['A 1,5 km de un punto']);
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '1234' })).toEqual(['A 1,2 km de un punto']);
  });

  it('se describe `criteria`, no `effectiveCriteria`: una zona no produce chip de radio', () => {
    // La página deriva `geo` de una zona cubierta SOLO en `effectiveCriteria`.
    const filters = describeAppliedFilters(criteria({ zone: '28065' }), 'Getafe');
    expect(filters.map((filter) => filter.key)).toEqual(['zone']);
  });
});

describe('formatListCount — spec "Result count"', () => {
  it('página 1 sin página siguiente: recuento completo', () => {
    expect(formatListCount(7, 1, false)).toBe('7 resultados');
    expect(formatListCount(1, 1, false)).toBe('1 resultado');
  });

  it('cero resultados se dice igual', () => {
    expect(formatListCount(0, 1, false)).toBe('0 resultados');
  });

  it('con página siguiente es parcial y lleva el indicador de página', () => {
    const text = formatListCount(20, 1, true);
    expect(text).toContain('20 resultados en esta página');
    expect(text).toContain('página 1');
  });

  it('en la página 2 es parcial aunque no haya siguiente', () => {
    const text = formatListCount(3, 2, false);
    expect(text).toContain('3 resultados en esta página');
    expect(text).toContain('página 2');
  });
});

describe('formatMapCount', () => {
  it('singular y plural', () => {
    expect(formatMapCount(1)).toBe('1 vivienda con ubicación coincide');
    expect(formatMapCount(120)).toBe('120 viviendas con ubicación coinciden');
    expect(formatMapCount(0)).toBe('0 viviendas con ubicación coinciden');
  });
});

const FIELD_VALUES = { operation: 'rent', minPrice: '900', maxSurface: '120', sort: 'price', dir: 'asc' } as const;

// Spec «Shared fields»: el panel de `?q=` y la barra comparten los campos; solo
// cambia el prefijo de los ids (y el `for` de cada etiqueta).
describe('CriteriaFields — campos compartidos (spec "Shared fields", "Markup contract")', () => {
  const panel = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="criteria" />);
  const bar = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="filter" />);

  it('con prefijo distinto el marcado es idéntico salvo ids y `for`', () => {
    expect(bar.replaceAll('filter-', 'criteria-')).toBe(panel);
    expect(bar).not.toBe(panel);
  });

  it('conserva ids criteria-<campo>, leyendas, nombres y valores prefijados', () => {
    for (const field of [
      'operation',
      'propertyType',
      'minPrice',
      'maxPrice',
      'minSurface',
      'maxSurface',
      'minRooms',
      'minBathrooms',
      'sort',
      'dir',
    ]) {
      expect(panel).toContain(`id="criteria-${field}"`);
      expect(panel).toContain(`for="criteria-${field}"`);
      expect(panel).toContain(`name="${field}"`);
    }
    expect(panel).toContain('<legend>Precio (€)</legend>');
    expect(panel).toContain('<legend>Superficie (m²)</legend>');
    expect(panel).toMatch(/<input[^>]*name="minPrice"[^>]*value="900"|<input[^>]*value="900"[^>]*name="minPrice"/);
  });

  it('el orden de los campos es el de la barra', () => {
    const order = ['operation', 'propertyType', 'minPrice', 'maxPrice', 'minSurface', 'maxSurface', 'minRooms', 'minBathrooms', 'sort', 'dir'];
    const positions = order.map((field) => panel.indexOf(`name="${field}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

function bar(params: Record<string, string | string[]>, rejectedKeys?: ReadonlySet<string>): string {
  return renderToStaticMarkup(<FilterBar params={params} rejectedKeys={rejectedKeys} />);
}

// React no garantiza el orden de los atributos: se busca la etiqueta que
// contiene todos los fragmentos.
function findTag(html: string, tagName: string, ...needles: string[]): string | undefined {
  const tags = html.match(new RegExp(`<${tagName}[ >][^>]*>?`, 'g')) ?? [];
  return tags.find((tag) => needles.every((needle) => tag.includes(needle)));
}

describe('FilterBar — spec "Filter bar"', () => {
  it('es un formulario GET con nombre, no role=search, con la marca form=criteria y envío', () => {
    const html = bar({ operation: 'sale' });
    expect(findTag(html, 'form', 'method="get"', 'action="/"', 'aria-label="Filtros de búsqueda"')).toBeDefined();
    expect(html).not.toContain('role="search"');
    expect(findTag(html, 'input', 'type="hidden"', 'name="form"', 'value="criteria"')).toBeDefined();
    expect(html).toContain('Aplicar filtros');
  });

  it('usa ids con prefijo filter- y los valores prefijados (crudos)', () => {
    const html = bar({ operation: 'sale', maxPrice: '200000' });
    expect(html).toContain('id="filter-maxPrice"');
    expect(html).not.toContain('criteria-');
    expect(findTag(html, 'input', 'name="maxPrice"', 'value="200000"')).toBeDefined();
    expect(html).toMatch(/<option value="sale" selected/);
  });

  it('reenvía view y zone en ocultos y nunca page (spec "Hidden state kept, page dropped")', () => {
    const html = bar({ view: 'map', zone: '28079', page: '3' });
    expect(findTag(html, 'input', 'type="hidden"', 'name="view"', 'value="map"')).toBeDefined();
    expect(findTag(html, 'input', 'type="hidden"', 'name="zone"', 'value="28079"')).toBeDefined();
    expect(html).not.toContain('name="page"');
  });

  it('valores no representables (spec "Unrepresentable values"): valor crudo, select sin opción coincidente', () => {
    const html = bar({ minPrice: 'abc', operation: 'foo' }, new Set(['minPrice', 'operation']));
    expect(findTag(html, 'input', 'type="number"', 'name="minPrice"', 'value="abc"')).toBeDefined();
    // Ninguna opción real coincide con `foo`: no hay `sale` ni `rent` marcadas.
    expect(html).not.toMatch(/<option value="(sale|rent)" selected/);
    expect(findTag(html, 'input', 'type="hidden"', 'name="minPrice"')).toBeUndefined();
    expect(findTag(html, 'input', 'type="hidden"', 'name="operation"')).toBeUndefined();
  });

  it('las claves rechazadas no se reenvían como ocultas y el trío geográfico cae junto', () => {
    const html = bar({ view: 'map', lat: '1', lng: '2', radius: '0', zone: '28079' }, new Set(['radius']));
    expect(findTag(html, 'input', 'type="hidden"', 'name="view"')).toBeDefined();
    expect(findTag(html, 'input', 'type="hidden"', 'name="zone"')).toBeDefined();
    for (const name of ['lat', 'lng', 'radius']) {
      expect(findTag(html, 'input', 'type="hidden"', `name="${name}"`)).toBeUndefined();
    }
  });

  it('un valor repetido (array) no prefija nada', () => {
    const html = bar({ minRooms: ['1', '2'] });
    expect(findTag(html, 'input', 'name="minRooms"', 'value="1"')).toBeUndefined();
    expect(findTag(html, 'input', 'name="minRooms"', 'value=""')).toBeDefined();
  });
});

// Spec «Submit equivalence»: lo que envía la barra, canonicalizado, valida igual
// que la URL escrita a mano.
describe('FilterBar — equivalencia de envío (spec "Same validated params")', () => {
  const typed = { operation: 'sale', maxPrice: '200000' };
  // Un GET HTML envía TODOS los campos: la marca y los vacíos incluidos.
  const submitted = {
    form: 'criteria',
    operation: 'sale',
    propertyType: '',
    minPrice: '',
    maxPrice: '200000',
    minSurface: '',
    maxSurface: '',
    minRooms: '',
    minBathrooms: '',
    sort: '',
    dir: '',
  };

  it('tras canonicalizar da los mismos parámetros validados', () => {
    expect(canonicalizeFormSubmission(submitted)).toEqual(typed);
    expect(searchQuerySchema.parse(canonicalizeFormSubmission(submitted))).toEqual(searchQuerySchema.parse(typed));
  });

  it('el HTML de la barra ofrece exactamente los campos que esa equivalencia asume', () => {
    const html = bar(typed);
    for (const name of Object.keys(submitted)) {
      expect(html).toContain(`name="${name}"`);
    }
  });
});

function chips(params: Record<string, string>, zoneName: string | null = null, count = '7 resultados'): string {
  return renderToStaticMarkup(
    <AppliedFilters criteria={criteria(params)} params={params} zoneName={zoneName} count={count} />
  );
}

describe('AppliedFilters — spec "Applied-filter chips" y "Clear all"', () => {
  it('sin filtros: el recuento sigue, pero no hay lista ni sección ni «Quitar todos»', () => {
    const html = chips({ sort: 'price' }, null, '0 resultados');
    expect(html).toContain('0 resultados');
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('Filtros aplicados');
    expect(html).not.toContain('Quitar');
  });

  it('un chip: quita solo su filtro y page, y no ofrece «Quitar todos»', () => {
    const html = chips({ minRooms: '2', sort: 'price', dir: 'asc', page: '2' });
    expect(html).toContain('aria-label="Filtros aplicados"');
    expect(html).toContain('href="/?sort=price&amp;dir=asc"');
    expect(html).toContain('Habitaciones: 2 o más');
    expect(html).not.toContain('Quitar todos');
    expect((html.match(/<li/g) ?? []).length).toBe(1);
  });

  it('dos chips o más: aparece «Quitar todos» que conserva view, sort y dir', () => {
    const html = chips({ view: 'map', sort: 'price', dir: 'asc', minRooms: '2', zone: '28079', page: '4' }, 'Madrid');
    expect(html).toContain('Zona: Madrid');
    expect(html).toContain('href="/?view=map&amp;sort=price&amp;dir=asc"');
    expect(html).toContain('Quitar todos');
    expect((html.match(/<li/g) ?? []).length).toBe(2);
  });

  it('el chip geográfico es uno y su href quita las tres claves', () => {
    const html = chips({ lat: '40.4', lng: '-3.7', radius: '5000', operation: 'rent' });
    expect(html).toContain('A 5 km de un punto');
    expect(html).toContain('href="/?operation=rent"');
    expect((html.match(/<li/g) ?? []).length).toBe(2);
  });

  it('el nombre accesible empieza por «Quitar» y la × es decorativa', () => {
    const html = chips({ minRooms: '2' });
    expect(html).toMatch(/<span class="sr-only">Quitar filtro: <\/span>Habitaciones: 2 o más/);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>×<\/span>/);
  });
});

// D.6a (spec search-filters) — etiquetas de los filtros aplicados y recuentos,
// y componentes de la barra de filtros y de los filtros aplicados. Funciones
// puras y `renderToStaticMarkup`: sin red ni base de datos.
import { searchQuerySchema } from '@buscahogar/core';
import type { PropertySearchCriteria } from '@buscahogar/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppliedFilters, AppliedFiltersSummary } from '../src/components/applied-filters.js';
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

  // D.6b: el indicador de página es del paginador; el recuento ya no lo repite.
  it('con página siguiente es parcial y no repite el número de página', () => {
    expect(formatListCount(20, 1, true)).toBe('20 resultados en esta página');
  });

  it('en la página 2 es parcial aunque no haya siguiente', () => {
    expect(formatListCount(3, 2, false)).toBe('3 resultados en esta página');
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

// D.6b (spec mobile-filter-tray, decisión 153) — la barra va dentro de un
// <details>. Cerrada por defecto; abierta cuando hay parámetros inválidos.
function tray(activeCount?: number, open?: boolean): string {
  return renderToStaticMarkup(<FilterBar params={{}} activeCount={activeCount} open={open} />);
}

function summaryOf(html: string): string {
  return /<summary[^>]*>(.*?)<\/summary>/s.exec(html)?.[1] ?? '';
}

describe('FilterBar — bandeja (S16, S17)', () => {
  it('envuelve el formulario en un <details class="filter-tray"> cerrado por defecto', () => {
    const html = tray();
    expect(html).toMatch(/^<details class="filter-tray"><summary[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.indexOf('<summary')).toBeLessThan(html.indexOf('<form'));
    expect(html).toContain('aria-label="Filtros de búsqueda"');
    expect(html).toContain('Aplicar filtros');
  });

  it('S16: con 3 filtros, la píldora «3» lleva el sufijo oculto « activos»', () => {
    const summary = summaryOf(tray(3));
    expect(summary).toContain('Filtros');
    expect(summary).toMatch(/>3<span class="sr-only"> activos<\/span>/);
  });

  it('S16: con 1 filtro, el sufijo es « activo» en singular', () => {
    const summary = summaryOf(tray(1));
    expect(summary).toMatch(/>1<span class="sr-only"> activo<\/span>/);
    expect(summary).not.toContain('activos');
  });

  it('S16: con 0 o sin recuento no hay píldora ni número', () => {
    for (const html of [tray(0), tray(undefined)]) {
      const summary = summaryOf(html);
      expect(summary).toContain('Filtros');
      expect(summary).not.toMatch(/\d/);
      expect(summary).not.toContain('sr-only');
    }
  });

  it('S17: `open` abre la bandeja y sin recuento no hay número', () => {
    const html = renderToStaticMarkup(<FilterBar params={{ minPrice: 'abc' }} rejectedKeys={new Set(['minPrice'])} open />);
    expect(html).toMatch(/^<details class="filter-tray" open="">/);
    expect(summaryOf(html)).not.toMatch(/\d/);
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

// D.7 (decisión 159, spec applied-filters-summary S11.1/S11.2) — el chip
// interactivo no cambia y la variante de solo lectura reutiliza su forma.
const INTERACTIVE_CHIP_CLASS =
  'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-control border border-rule-control bg-surface-raised px-3 text-dense text-ink no-underline applied-filters__chip';

describe('AppliedFilters — chip interactivo intacto tras extraer la forma común (S11.1)', () => {
  it('la clase del enlace es, byte a byte, la de D.6a', () => {
    expect(chips({ minRooms: '2' })).toContain(`class="${INTERACTIVE_CHIP_CLASS}"`);
  });
});

function summary(params: Record<string, string>, zoneName: string | null = null): string {
  return renderToStaticMarkup(<AppliedFiltersSummary criteria={criteria(params)} zoneName={zoneName} />);
}

describe('AppliedFiltersSummary — variante de solo lectura (S2.1, S11.2)', () => {
  it('lista los mismos rótulos que los chips, sin enlaces, sin recuento y con nombre propio', () => {
    const html = summary({ operation: 'rent', maxPrice: '900', zone: '28065' }, 'Getafe');
    expect(html).toContain('aria-label="Filtros interpretados"');
    expect(html).not.toContain('Filtros aplicados');
    for (const label of ['Operación: Alquiler', 'Precio hasta 900 €', 'Zona: Getafe']) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('<a');
    expect(html).not.toContain('Quitar');
    expect(html).not.toMatch(/\d+ resultados?/);
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });

  it('el chip comparte la forma del interactivo pero no es un control (sin borde)', () => {
    const html = summary({ minRooms: '2' });
    expect(html).toContain('inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-control');
    expect(html).toContain('bg-surface-sunken');
    expect(html).not.toContain('border-rule-control');
  });

  it('sin filtros no pinta nada', () => {
    expect(summary({ sort: 'price' })).toBe('');
  });
});

// D.7 (decisión 161, spec R3) — agrupación opcional de los campos.
describe('CriteriaFields — agrupación opcional (S3.1, S3.2)', () => {
  const zoneSlot = <div data-slot="zone-slot" />;
  const grouped = renderToStaticMarkup(
    <CriteriaFields values={FIELD_VALUES} idPrefix="criteria" grouped={{ zone: zoneSlot }} />
  );

  it('S3.1: cinco títulos en orden y «Orden de los resultados» el último', () => {
    const headings = ['¿Qué buscas?', '¿Cuánto quieres pagar?', '¿De qué tamaño?', '¿Dónde?', 'Orden de los resultados'];
    const positions = headings.map((heading) => grouped.indexOf(`<h3>${heading}</h3>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(grouped.match(/<h3/g)).toHaveLength(5);
  });

  it('la zona va entre los baños y el orden, y las leyendas y nombres se conservan', () => {
    expect(grouped.indexOf('name="minBathrooms"')).toBeLessThan(grouped.indexOf('data-slot="zone-slot"'));
    expect(grouped.indexOf('data-slot="zone-slot"')).toBeLessThan(grouped.indexOf('name="sort"'));
    expect(grouped).toContain('<legend>Precio (€)</legend>');
    expect(grouped).toContain('<legend>Superficie (m²)</legend>');
    expect(grouped).toContain('id="criteria-minPrice"');
  });

  it('S3.2: sin `grouped` no hay títulos y el marcado plano no cambia', () => {
    const flat = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="criteria" />);
    expect(flat).not.toContain('<h3');
    expect(flat).not.toContain('criteria-group');
    expect(renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="filter" />).replaceAll('filter-', 'criteria-')).toBe(flat);
  });
});

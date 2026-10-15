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

  // D.18 (decisión 220) — el precio agrupa siempre los miles; la superficie sigue la regla de la RAE.
  it('un precio de cuatro cifras lleva punto y una superficie de cuatro cifras no', () => {
    expect(labels({ minPrice: '1180', minSurface: '1180' })).toEqual([
      'Precio desde 1.180 €',
      'Superficie desde 1180 m²',
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

  // D.18 (decisión 224): la zona con centroide y radio siempre se aplica; el chip es siempre el mismo
  // y nunca lleva el sufijo «· sin datos todavía» de D.17.
  it('el chip de zona es siempre «Zona: {municipio}», sin sufijo, y la clave es la de la zona', () => {
    expect(describeAppliedFilters(criteria({ zone: '28065' }), 'Getafe')).toEqual([
      { key: 'zone', label: 'Zona: Getafe' },
    ]);
    expect(describeAppliedFilters(criteria({ zone: '28074' }), 'Leganés')[0]?.label).toBe('Zona: Leganés');
    expect(labels({ zone: '28074', operation: 'rent' }, 'Leganés').join('|')).not.toContain('sin datos');
  });

  it('sin nombre resuelto el rótulo es «Zona INE {código}»', () => {
    expect(describeAppliedFilters(criteria({ zone: '28079' }), null)[0]?.label).toBe('Zona INE 28079');
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
    const order = ['operation', 'propertyType', 'minPrice', 'maxPrice', 'minSurface', 'maxSurface', 'minRooms', 'minBathrooms'];
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

  // D.17 (B2): «Aplicar filtros» es la acción principal de la barra y se pinta como tal.
  it('el envío de la barra es el botón principal, con el texto «Aplicar filtros»', () => {
    const html = tray();
    expect(html).toMatch(/<button type="submit" class="filter-bar__submit">Aplicar filtros<\/button>/);
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

  // D.18 (decisión 227): sort y dir ya no son desplegables de la barra; viajan como ocultos para
  // que enviar un filtro conserve la ordenación elegida (XC3).
  it('el HTML de la barra ofrece los campos que esa equivalencia asume, y sort/dir como ocultos', () => {
    const html = bar({ ...typed, sort: 'price', dir: 'asc' });
    for (const name of Object.keys(submitted)) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(findTag(html, 'input', 'type="hidden"', 'name="sort"', 'value="price"')).toBeDefined();
    expect(findTag(html, 'input', 'type="hidden"', 'name="dir"', 'value="asc"')).toBeDefined();
    expect(html).not.toContain('<select id="filter-sort"');
    expect(html).not.toContain('Cualquiera</option><option value="price"');
  });

  it('sin ordenación en la URL no hay ocultos de sort ni dir', () => {
    const html = bar(typed);
    expect(findTag(html, 'input', 'name="sort"')).toBeUndefined();
    expect(findTag(html, 'input', 'name="dir"')).toBeUndefined();
  });

  it('ida y vuelta: el envío de la barra con sort/dir ocultos conserva el orden elegido', () => {
    const roundTrip = canonicalizeFormSubmission({ ...submitted, minRooms: '2', sort: 'price', dir: 'asc' });
    expect(roundTrip).toEqual({ operation: 'sale', maxPrice: '200000', minRooms: '2', sort: 'price', dir: 'asc' });
  });
});

// D.18 (decisión 227) — el panel de `?q=` ofrece el orden como cinco radios `name="order"`.
describe('CriteriaFields agrupado — orden como radios (D.18)', () => {
  function panel(values: Record<string, string>): string {
    return renderToStaticMarkup(<CriteriaFields values={values} idPrefix="criteria" grouped={{ zone: <div /> }} />);
  }

  it('cinco radios con los rótulos C-9, valores = ids y sin selects de orden', () => {
    const html = panel({});
    const radios = [...html.matchAll(/<input[^>]*name="order"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => /value="([^"]*)"/.exec(r)?.[1])).toEqual([
      'recent',
      'price-asc',
      'price-desc',
      'surface-desc',
      'surface-asc',
    ]);
    for (const label of [
      'Más recientes',
      'Precio: de menor a mayor',
      'Precio: de mayor a menor',
      'Superficie: de mayor a menor',
      'Superficie: de menor a mayor',
    ]) {
      expect(html).toMatch(new RegExp(`<label for="criteria-order-[a-z-]+">${label}</label>`));
    }
    expect(html).not.toContain('name="sort"');
    expect(html).not.toContain('name="dir"');
    expect(html).not.toContain('Cualquiera</option><option value="price"');
    expect(html).not.toContain('Sentido');
  });

  it('marca el preset interpretado; sin orden interpretado, el predefinido', () => {
    const checkedOf = (html: string): string[] =>
      [...html.matchAll(/<input[^>]*name="order"[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => tag.includes('checked'))
        .map((tag) => /value="([^"]*)"/.exec(tag)?.[1] ?? '');
    expect(checkedOf(panel({ sort: 'price', dir: 'asc' }))).toEqual(['price-asc']);
    expect(checkedOf(panel({ sort: 'surface' }))).toEqual(['surface-desc']);
    expect(checkedOf(panel({}))).toEqual(['recent']);
  });

  it('el grupo conserva el título «Orden de los resultados» y un fieldset con ese nombre', () => {
    const html = panel({});
    expect(html).toContain('<h3>Orden de los resultados</h3>');
    expect(html).toContain('<legend class="sr-only">Orden de los resultados</legend>');
  });
});

function chips(params: Record<string, string>, zoneName: string | null = null, count = '7 resultados'): string {
  return renderToStaticMarkup(
    <AppliedFilters criteria={criteria(params)} params={params} zoneName={zoneName} count={count} />
  );
}

describe('AppliedFilters — zona (D.18, decisión 224)', () => {
  it('el chip de zona es un enlace que quita la zona y nunca lleva sufijo', () => {
    const params = { zone: '28074', operation: 'rent' };
    const html = renderToStaticMarkup(
      <AppliedFilters criteria={criteria(params)} params={params} zoneName="Leganés" count="3 resultados" />
    );
    expect(html).toContain('Zona: Leganés');
    expect(html).toContain('href="/?operation=rent"');
    expect(html).toContain('Operación: Alquiler');
    expect(html).not.toContain('sin datos todavía');
  });
});

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

  it('la lista de chips envuelve en varias líneas y nunca se desplaza en horizontal', () => {
    const html = chips({ minRooms: '2', minBathrooms: '1' });
    const list = /<ul class="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(list.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'min-w-0', 'gap-2']));
    expect(list).not.toContain('overflow-x-auto');
    expect(html).toContain('<li class="min-w-0 max-w-full">');
    expect((html.match(/<li/g) ?? []).length).toBe(2);
  });

  it('el nombre accesible empieza por «Quitar» y el icono de cierre es decorativo', () => {
    const html = chips({ minRooms: '2' });
    expect(html).toMatch(/<span class="sr-only">Quitar filtro: <\/span>Habitaciones: 2 o más/);
    expect(html).toMatch(/<svg class="icon text-ink-muted"[^>]*aria-hidden="true"/);
    expect(html).not.toContain('×');
    expect(html).not.toContain('nowrap');
    expect(html).not.toContain('hover:');
  });
});

// D.7 (decisión 159, spec applied-filters-summary S11.1/S11.2) — el chip
// interactivo no cambia y la variante de solo lectura reutiliza su forma.
const INTERACTIVE_CHIP_CLASS =
  'inline-flex min-h-8 max-w-full items-center gap-1 rounded-control [overflow-wrap:anywhere] border border-rule-control bg-accent-wash px-3 text-dense text-ink no-underline applied-filters__chip';

describe('AppliedFilters — chip interactivo intacto tras extraer la forma común (S11.1)', () => {
  it('la clase del enlace es, byte a byte, la de D.6a', () => {
    expect(chips({ minRooms: '2' })).toContain(`class="${INTERACTIVE_CHIP_CLASS}"`);
  });
});

function summary(params: Record<string, string>, zoneName: string | null = null): string {
  return renderToStaticMarkup(<AppliedFiltersSummary criteria={criteria(params)} zoneName={zoneName} />);
}

// D.19 (decisión 231) — el lavado azul es el del control interactivo (One Blue Rule): el resumen de solo
// lectura no lo recibe y sigue en el papel hundido.
describe('AppliedFilters — lavado azul solo en el chip interactivo (D.19)', () => {
  it('el chip interactivo usa bg-accent-wash y ya no bg-surface-raised', () => {
    const html = chips({ minRooms: '2' });
    expect(html).toContain('bg-accent-wash');
    expect(html).not.toContain('bg-surface-raised');
  });

  it('el resumen de solo lectura no usa el lavado azul', () => {
    const html = summary({ operation: 'rent' });
    expect(html).toContain('bg-surface-sunken');
    expect(html).not.toContain('accent-wash');
  });
});

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
    expect(html).toContain('inline-flex min-h-8 max-w-full items-center gap-1 rounded-control [overflow-wrap:anywhere]');
    expect(html).toContain('bg-surface-sunken');
    expect(html).not.toContain('border-rule-control');
  });

  it('sin filtros no pinta nada', () => {
    expect(summary({ sort: 'price' })).toBe('');
  });
});

// D.15 (decisión 204) — pista única «solo cifras» para los seis campos numéricos (`type="number"`:
// Chrome descarta en silencio las letras y nada lo avisaba a un lector de pantalla). Una sola pista
// visible por formulario, con id derivado del prefijo, referenciada por `aria-describedby`.
describe('CriteriaFields — pista «solo cifras» (D.15, decisión 204)', () => {
  const NUMBER_FIELDS = ['minPrice', 'maxPrice', 'minSurface', 'maxSurface', 'minRooms', 'minBathrooms'] as const;
  const HINT = 'Precio, superficie, habitaciones y baños: solo cifras.';

  it.each(['criteria', 'filter'])('%s: una sola pista visible con el texto acordado', (prefix) => {
    const flat = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix={prefix} />);
    expect(flat.match(new RegExp(`id="${prefix}-numeric-hint"`, 'g'))).toHaveLength(1);
    expect(flat).toContain(`>${HINT}</p>`);
    expect(flat).not.toMatch(/id="[^"]*-numeric-hint"[^>]*(hidden|sr-only)/);
  });

  it.each(['criteria', 'filter'])('%s: los seis campos numéricos apuntan a la pista y los desplegables no', (prefix) => {
    const html = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix={prefix} />);
    for (const field of NUMBER_FIELDS) {
      expect(findTag(html, 'input', `name="${field}"`)).toContain(`aria-describedby="${prefix}-numeric-hint"`);
    }
    for (const field of ['operation', 'propertyType']) {
      expect(findTag(html, 'select', `name="${field}"`)).not.toContain('aria-describedby');
    }
  });

  // D.17 (B2): en la barra plana la pista queda pegada a los campos numéricos, no suelta encima.
  // D.18: sin desplegables de orden, la pista cierra el formulario plano.
  it.each(['criteria', 'filter'])('%s plano: la pista va tras los baños y es lo último', (prefix) => {
    const flat = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix={prefix} />);
    const hint = flat.indexOf(`id="${prefix}-numeric-hint"`);
    expect(hint).toBeGreaterThan(flat.indexOf('name="minBathrooms"'));
    expect(flat.endsWith('solo cifras.</p>')).toBe(true);
    expect(flat).not.toContain('name="sort"');
    expect(flat).not.toContain('name="dir"');
    expect(flat).not.toContain('name="order"');
  });

  it('agrupado: la pista se pinta una vez, en el grupo de precio, antes del primer número', () => {
    const html = renderToStaticMarkup(
      <CriteriaFields values={FIELD_VALUES} idPrefix="criteria" grouped={{ zone: <div /> }} />
    );
    expect(html.match(/id="criteria-numeric-hint"/g)).toHaveLength(1);
    expect(html.indexOf('<h3>¿Cuánto quieres pagar?</h3>')).toBeLessThan(html.indexOf('id="criteria-numeric-hint"'));
    expect(html.indexOf('id="criteria-numeric-hint"')).toBeLessThan(html.indexOf('name="minPrice"'));
    expect(html.indexOf('id="criteria-numeric-hint"')).toBeLessThan(html.indexOf('<h3>¿De qué tamaño?</h3>'));
  });

  it('rechazado: la pista primero y la alerta después; sin rechazo, solo la pista', () => {
    const html = renderToStaticMarkup(
      <CriteriaFields
        values={FIELD_VALUES}
        idPrefix="criteria"
        invalid={{ keys: new Set(['minRooms']), errorId: 'criteria-alert' }}
      />
    );
    expect(findTag(html, 'input', 'name="minRooms"')).toContain('aria-describedby="criteria-numeric-hint criteria-alert"');
    expect(findTag(html, 'input', 'name="minBathrooms"')).toContain('aria-describedby="criteria-numeric-hint"');
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
    expect(grouped.indexOf('data-slot="zone-slot"')).toBeLessThan(grouped.indexOf('name="order"'));
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

// D.15 (F4, R9, decisión 196) — un campo rechazado por el esquema se declara inválido y apunta a
// la alerta única que explica por qué; los demás no llevan ni `aria-invalid` ni `aria-describedby`.
describe('FilterBar D.15 — campos rechazados', () => {
  const rejected = new Set(['minPrice', 'sort']);
  const html = renderToStaticMarkup(
    <FilterBar params={{ minPrice: 'abc', sort: 'x', maxPrice: '900' }} rejectedKeys={rejected} alertId="filter-alert" open />
  );

  // D.18: el `sort` rechazado no se reenvía como oculto y la barra ya no tiene desplegable de orden.
  it('un sort rechazado no se reenvía y no hay campo de orden que marcar', () => {
    expect(findTag(html, 'input', 'name="sort"')).toBeUndefined();
    expect(html).not.toContain('<select id="filter-sort"');
  });

  it('el número y el desplegable rechazados llevan aria-invalid y la descripción de la alerta', () => {
    const minPrice = findTag(html, 'input', 'name="minPrice"');
    expect(minPrice).toContain('aria-invalid="true"');
    // D.15 (decisión 204): la pista de «solo cifras» va primero, la alerta después (mismo orden que
    // el campo de texto libre: ayuda y luego alerta).
    expect(minPrice).toContain('aria-describedby="filter-numeric-hint filter-alert"');
    const operation = findTag(html, 'select', 'name="operation"');
    expect(operation).not.toContain('aria-invalid');
  });

  it('un campo válido no lleva aria-invalid ni aria-describedby', () => {
    const maxPrice = findTag(html, 'input', 'name="maxPrice"');
    expect(maxPrice).toBeDefined();
    expect(maxPrice).not.toContain('aria-invalid');
    expect(maxPrice).toContain('aria-describedby="filter-numeric-hint"');
    expect(maxPrice).not.toContain('filter-alert');
    expect(findTag(html, 'select', 'name="operation"')).not.toContain('aria-invalid');
  });

  it('sin rechazos (la barra normal) ningún campo lleva aria-invalid', () => {
    expect(bar({ minPrice: '100' })).not.toContain('aria-invalid');
    // `view` es un rechazo válido de la página pero no un campo de la barra.
    expect(renderToStaticMarkup(<FilterBar params={{}} rejectedKeys={new Set(['view'])} alertId="filter-alert" />)).not.toContain('aria-invalid');
  });
});

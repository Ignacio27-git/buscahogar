// ROADMAP 2.6 (decisión 118, spec SMV-1..SMV-14, DAS-11) y D.8a (decisión 163,
// SMV-15..SMV-17) — la página `/` con lista y mapa a la vez (ambas consultas en
// cada petición válida) y el aviso de "fuera de cobertura". Invocación
// directa de la función de la página con `@buscahogar/db`, los módulos de
// cobertura y `<SearchMap/>` sustituidos por dobles: ninguna prueba toca una
// base de datos, la red ni Leaflet.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatPriceCents } from '../src/lib/format-price.js';

const searchPropertiesMock = vi.fn();
const searchMapPointsMock = vi.fn();
const suggestZonesMock = vi.fn();
const resolveZoneGeometryMock = vi.fn();
const resolveCoverageForZoneMock = vi.fn();
const resolveNewZonesDailyCapMock = vi.fn();
const resolveCoverageClientLimitMock = vi.fn();
const getCoverageDbMock = vi.fn();
const recordSignalMock = vi.fn();

vi.mock('@/server/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('@/server/coverage-db', () => ({ getCoverageDb: getCoverageDbMock }));
vi.mock('@/server/coverage-client', () => ({
  resolveCoverageClientLimit: resolveCoverageClientLimitMock,
}));
vi.mock('@/server/coverage', () => ({
  resolveCoverageForZone: resolveCoverageForZoneMock,
  resolveNewZonesDailyCap: resolveNewZonesDailyCapMock,
}));
vi.mock('@/server/query-signal', () => ({ recordZoneQuerySignalSafely: recordSignalMock }));
vi.mock('@buscahogar/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@buscahogar/db')>();
  return {
    ...actual,
    searchProperties: searchPropertiesMock,
    searchMapPoints: searchMapPointsMock,
    suggestZones: suggestZonesMock,
    resolveZoneGeometry: resolveZoneGeometryMock,
  };
});
// D.13: `CoverageStatus` (cliente, `useRouter`) no se puede renderizar en estático; el doble
// deja una marca para comprobar cuándo la página lo monta.
vi.mock('@/components/coverage-status', async () => {
  const { createElement } = await import('react');
  return {
    CoverageStatus: (props: { job: { status: string } }): unknown =>
      createElement('p', { 'data-testid': 'coverage-status' }, props.job.status),
  };
});
// Doble del wrapper de cliente: vuelca sus props en un atributo para poder
// inspeccionarlas sin cargar Leaflet.
vi.mock('@/components/search-map', async () => {
  const { createElement } = await import('react');
  return {
    SearchMap: (props: unknown): unknown =>
      createElement('div', { 'data-testid': 'search-map', 'data-props': JSON.stringify(props) }),
  };
});

const { default: HomePage } = await import('../src/app/(search)/page.js');

const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';
const NOT_COVERED = 'No hay viviendas en la zona dibujada.';
const NO_SWEEPS = 'Dibujar una zona no pide su actualización';
const RELOAD_LINK = '>Comprobar de nuevo</a>';
// D.14: toda línea de estado vacío de lista o mapa que NO debe aparecer cuando el aviso de
// cobertura es la única explicación.
const EMPTY_LINES = [
  'Ninguna vivienda coincide',
  'Ninguna vivienda con ubicación',
  'Todavía no hay viviendas',
  'Esta página ya no tiene viviendas',
];

async function render(params: Record<string, string | string[] | undefined>): Promise<string> {
  return renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(params) }));
}

function makePoint(index: number): {
  id: string;
  lat: number;
  lon: number;
  minPriceCents: number | null;
  anchorListingId: string | null;
} {
  return {
    id: `p-${String(index)}`,
    lat: 40.4 + index / 10000,
    lon: -3.7,
    minPriceCents: 100000 + index,
    anchorListingId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

function mapResult(count: number, total: number = count): void {
  const points = Array.from({ length: count }, (_, index) => makePoint(index));
  searchMapPointsMock.mockResolvedValue({ points, total, truncated: total > count });
}

function propsOf(html: string): {
  points: { id: string; priceLabel: string; href: string | null }[];
  polygon: { lat: number; lon: number }[] | null;
  baseParams: Record<string, string>;
} {
  const match = /data-props="([^"]*)"/.exec(html);
  if (match === null) {
    throw new Error('SearchMap no se ha renderizado');
  }
  const raw = match[1] ?? '';
  return JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as ReturnType<
    typeof propsOf
  >;
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// D.8a (SMV-15): la lista precede al mapa en el HTML; estas dos funciones parten
// el documento en sus secciones para comprobar dónde vive cada aviso.
function mapSection(html: string): string {
  const start = html.indexOf('search-results__map"');
  if (start === -1) {
    throw new Error('Falta la sección del mapa');
  }
  return html.slice(start);
}

function listSection(html: string): string {
  const start = html.indexOf('search-results__list"');
  const end = html.indexOf('search-results__map"');
  if (start === -1 || end === -1) {
    throw new Error('Faltan las secciones de lista y mapa');
  }
  return html.slice(start, end);
}

function makeListResult(index: number): Record<string, unknown> {
  return {
    id: `r-${String(index)}`,
    anchorListingId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: null,
    propertyType: 'flat',
    operation: 'sale',
    minPriceCents: 100000 + index,
    rooms: 2,
    bathrooms: 1,
    areaM2: 70,
    municipality: 'Madrid',
    thumbnailUrl: null,
  };
}

beforeEach(() => {
  for (const mock of [
    searchPropertiesMock,
    searchMapPointsMock,
    suggestZonesMock,
    resolveZoneGeometryMock,
    resolveCoverageForZoneMock,
    resolveNewZonesDailyCapMock,
    resolveCoverageClientLimitMock,
    getCoverageDbMock,
    recordSignalMock,
  ]) {
    mock.mockReset();
  }
  searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: false });
  // D.8a: toda petición válida consulta también el mapa; por defecto, vacío.
  searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
});

describe('lista y mapa en cada petición válida (SMV-15, WSL-D8a-1)', () => {
  it.each([{ view: 'list' }, { view: 'map' }, {}])(
    'con %j ambas consultas corren exactamente una vez y las dos secciones se renderizan',
    async (params) => {
      mapResult(3);
      const html = await render(params);
      expect(searchPropertiesMock).toHaveBeenCalledTimes(1);
      expect(searchMapPointsMock).toHaveBeenCalledTimes(1);
      expect(html).toContain('search-results__list"');
      expect(html).toContain('search-results__map"');
      expect(html).toContain('data-testid="search-map"');
      expect(html.indexOf('search-results__list"')).toBeLessThan(
        html.indexOf('search-results__map"')
      );
    }
  );

  it('el envoltorio lleva el valor de `view` (ausente = list) para que el CSS decida la visibilidad', async () => {
    mapResult(1);
    expect(await render({})).toContain('class="search-results" data-view="list"');
    mapResult(1);
    expect(await render({ view: 'map' })).toContain('class="search-results" data-view="map"');
  });

  // P8 (pulido de D.21): el aviso de cobertura, el del polígono y el conmutador viven en la rejilla de
  // resultados (primera fila de la columna de la lista) para que el mapa empiece en su misma fila.
  it('el título y los filtros aplicados van en .search-header; los avisos y el conmutador, al inicio de los resultados', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    const html = await render({ polygon: POLYGON });
    const start = html.indexOf('<div class="search-header">');
    const end = html.indexOf('class="search-results"');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const header = html.slice(start, end);
    expect(header).toContain('<h1');
    expect(header).toContain('aria-label="Filtros aplicados"');
    expect(header).not.toContain('coverage-notice');
    expect(header).not.toContain('view-toggle');

    const results = html.slice(end);
    const notices = results.indexOf('<div class="search-results__notices">');
    expect(notices).toBeGreaterThanOrEqual(0);
    expect(notices).toBeLessThan(results.indexOf('search-results__list"'));
    const noticesHtml = results.slice(notices, results.indexOf('search-results__list"'));
    expect(noticesHtml).toContain('coverage-notice');
    expect(noticesHtml).toContain('class="view-toggle"');
    expect(noticesHtml.indexOf('coverage-notice')).toBeLessThan(noticesHtml.indexOf('class="view-toggle"'));
  });

  it('sin avisos y con resultados, el envoltorio solo lleva el conmutador', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    mapResult(1);
    const withToggle = await render({});
    expect(withToggle).toContain('<div class="search-results__notices"><p class="view-toggle">');
    expect(withToggle).not.toContain('coverage-notice');
  });

  // P8: con 0 resultados «Ver mapa» no lleva a ninguna parte; «Ver lista» sí se queda en la vista de mapa
  // (la lista vacía explica el vacío y es la única forma de volver a ella).
  it('con 0 resultados no hay «Ver mapa» ni envoltorio de avisos', async () => {
    const html = await render({ operation: 'sale' });
    expect(html).not.toContain('Ver mapa');
    expect(html).not.toContain('view-toggle');
    expect(html).not.toContain('search-results__notices');
  });

  it('con 0 resultados en la vista de mapa se conserva «Ver lista»', async () => {
    const html = await render({ operation: 'sale', view: 'map' });
    expect(html).toContain('<a href="/?operation=sale">Ver lista</a>');
  });

  it('con 0 resultados pero un aviso de cobertura, el envoltorio lleva el aviso y ningún conmutador', async () => {
    const html = await render({ polygon: POLYGON });
    const notices = html.slice(html.indexOf('<div class="search-results__notices">'), html.indexOf('search-results__list"'));
    expect(notices).toContain('No hay viviendas en la zona dibujada.');
    expect(notices).not.toContain('view-toggle');
  });

  // D.20 (decisión 235): el motivo de curvas de nivel es el primer hijo de .search-header, antes del h1.
  it('exactamente un motivo de curvas de nivel dentro de .search-header, antes del <h1>', async () => {
    const html = await render({ polygon: POLYGON });
    expect(html.match(/class="contour-motif"/g)).toHaveLength(1);
    const header = html.indexOf('<div class="search-header">');
    const motif = html.indexOf('class="contour-motif"');
    const title = html.indexOf('<h1');
    expect(header).toBeGreaterThanOrEqual(0);
    expect(motif).toBeGreaterThan(header);
    expect(motif).toBeLessThan(title);
    expect(html.indexOf('</svg>', motif)).toBeLessThan(title);
  });

  it('las consultas arrancan a la vez: la del mapa se lanza sin esperar a que termine la de la lista', async () => {
    let releaseList: (value: { results: never[]; hasNextPage: boolean }) => void = () => undefined;
    searchPropertiesMock.mockReturnValue(
      new Promise((resolve) => {
        releaseList = resolve;
      })
    );
    mapResult(1);
    const pending = HomePage({ searchParams: Promise.resolve({}) });
    await vi.waitFor(() => {
      expect(searchMapPointsMock).toHaveBeenCalledTimes(1);
    });
    releaseList({ results: [], hasNextPage: false });
    await pending;
    expect(searchPropertiesMock).toHaveBeenCalledTimes(1);
  });

  it('el mapa recibe el conjunto entero (500 puntos) aunque la lista esté en la página 3', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(1)], hasNextPage: true });
    mapResult(500, 2000);
    const html = await render({ page: '3' });
    expect(propsOf(html).points).toHaveLength(500);
    expect(searchMapPointsMock).toHaveBeenCalledTimes(1);
    expect(listSection(html)).toContain('/properties/00000000-0000-4000-8000-000000000001');
  });

  it('el recuento de la lista vive en el resumen compartido y la paginación solo en su sección', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(1)], hasNextPage: true });
    mapResult(5);
    const html = await render({ page: '2' });
    expect(html.indexOf('1 resultado en esta página')).toBeLessThan(
      html.indexOf('search-results__list"')
    );
    expect(count(html, 'Página siguiente')).toBe(1);
    expect(listSection(html)).toContain('Página siguiente');
    expect(mapSection(html)).not.toContain('Página siguiente');
  });

  it('sin resultados ni filtros la lista dice su vacío y el mapa el suyo, una vez cada uno, sin hablar de filtros', async () => {
    const html = await render({});
    expect(count(html, 'Todavía no hay viviendas.')).toBe(1);
    expect(listSection(html)).toContain('Todavía no hay viviendas.');
    expect(count(html, 'Todavía no hay viviendas con ubicación.')).toBe(1);
    expect(mapSection(html)).toContain('Todavía no hay viviendas con ubicación.');
    expect(mapSection(html)).not.toMatch(/filtros/);
    expect(html).not.toContain('Quitar');
  });
});

// D.18 (decisión 227) — enlaces de ordenación: solo con resultados, con el vigente marcado y sin
// perder los filtros; un `order` inválido del panel se rechaza con su nombre.
// D.18 (decisión 229, C-16): un único orden en el DOM = orden de lectura = orden visual, sin `order`
// de CSS: título, [pasos], buscador, barra de herramientas (filtros + ordenación), recuento y chips,
// sugerencias, panel de cobertura, aviso del polígono y conmutador de vista.
describe('orden del DOM de la cabecera (D.18, decisión 229)', () => {
  const geometry = {
    zoneId: 'zone-1',
    ineCode: '28074',
    municipality: 'Leganés',
    state: 'uncovered',
    centroid: { latitude: 40.33, longitude: -3.76 },
    sweepRadiusM: 4500,
  };

  function positions(html: string, needles: string[]): number[] {
    return needles.map((needle) => {
      const index = html.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    });
  }

  function ascending(values: number[]): boolean {
    return values.every((value, index) => index === 0 || value > (values[index - 1] ?? 0));
  }

  it('con resultados, zona sin cubrir, sugerencias y vista: el orden completo', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    mapResult(1);
    resolveZoneGeometryMock.mockResolvedValue(geometry);
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'not-sweepable' });
    suggestZonesMock.mockResolvedValue([
      { ineCode: '28074', municipality: 'Leganés', province: 'Madrid', state: 'uncovered', sweepable: true },
    ]);
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    const html = await render({ zone: '28074', zoneQuery: 'lega', operation: 'sale' });
    expect(
      ascending(
        positions(html, [
          '<h1>',
          '<search',
          'class="search-toolbar"',
          'class="filter-tray"',
          'class="sort-presets"',
          'aria-label="Filtros aplicados"',
          'aria-label="Sugerencias de zona"',
          'class="search-results"',
          'Todavía no hay viviendas de Leganés.',
          'class="view-toggle"',
          'search-results__list"',
        ])
      )
    ).toBe(true);
  });

  it('el aviso del polígono va tras los chips y antes del conmutador de vista', async () => {
    mapResult(0);
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    const html = await render({ polygon: POLYGON, operation: 'sale' });
    expect(
      ascending(
        positions(html, ['<search', 'aria-label="Filtros aplicados"', NOT_COVERED, 'class="view-toggle"'])
      )
    ).toBe(true);
  });

  it('la barra de herramientas agrupa la bandeja de filtros y la ordenación, en ese orden', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    mapResult(1);
    const html = await render({});
    const toolbar = html.slice(html.indexOf('class="search-toolbar"'), html.indexOf('class="search-results"'));
    const end = toolbar.indexOf('class="sort-presets"');
    expect(toolbar.indexOf('class="filter-tray"')).toBeGreaterThan(-1);
    expect(toolbar.indexOf('class="filter-tray"')).toBeLessThan(end);
  });

  it('sin resultados la barra solo lleva la bandeja de filtros', async () => {
    const html = await render({ operation: 'sale' });
    const toolbar = html.slice(html.indexOf('class="search-toolbar"'), html.indexOf('class="search-results"'));
    expect(toolbar).toContain('class="filter-tray"');
    expect(toolbar).not.toContain('sort-presets');
  });

  it('ningún elemento reordena con la propiedad order de CSS ni con row-reverse', async () => {
    const css = (await import('node:fs')).readFileSync(
      new URL('../src/app/globals.css', import.meta.url),
      'utf8'
    );
    expect(css).not.toMatch(/^\s*order\s*:/m);
    expect(css).not.toMatch(/flex-direction:\s*(row|column)-reverse/);
  });
});

describe('ordenación por enlaces (D.18)', () => {
  function withResults(): void {
    searchPropertiesMock.mockResolvedValue({
      results: [makeListResult(0), makeListResult(1)],
      hasNextPage: false,
    });
    mapResult(2);
  }

  it('con resultados pinta los cinco enlaces, con «Más recientes» vigente por defecto', async () => {
    withResults();
    const html = await render({ operation: 'sale' });
    expect(html).toContain('<p id="sort-presets-label">Ordenar por</p>');
    expect(count(html, 'sort-presets__link')).toBe(5);
    expect(html).toMatch(/<a href="\/\?operation=sale"[^>]*aria-current="true"[^>]*>Más recientes<\/a>/);
    expect(html).toContain('href="/?operation=sale&amp;sort=price&amp;dir=asc"');
  });

  it('marca el preset de la URL y ninguno para una combinación sin preset', async () => {
    withResults();
    const price = await render({ sort: 'price', dir: 'asc' });
    expect(count(price, 'aria-current="true"')).toBe(1);
    expect(price).toMatch(/aria-current="true"[^>]*>Precio: de menor a mayor</);
    const none = await render({ sort: 'updated', dir: 'asc' });
    expect(none).toContain('sort-presets__link');
    expect(none).not.toContain('aria-current="true"');
  });

  it('sin resultados no pinta enlaces de ordenación', async () => {
    const html = await render({ operation: 'sale' });
    expect(html).not.toContain('sort-presets');
  });

  it('un order desconocido del panel se rechaza con el nombre «Ordenar por»', async () => {
    const html = await render({ form: 'criteria', order: 'barato' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Ordenar por');
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });

  it('un order repetido también se rechaza, no se ignora', async () => {
    const html = await render({ form: 'criteria', order: ['recent', 'price-asc'] });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Ordenar por');
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });

  it('un order conocido del panel ordena la búsqueda', async () => {
    withResults();
    await render({ form: 'criteria', order: 'surface-asc' });
    const used = searchPropertiesMock.mock.calls[0]?.[1] as { sort: string; dir: string };
    expect(used.sort).toBe('surface');
    expect(used.dir).toBe('asc');
  });
});

describe('vista de mapa — recuento M y truncado (SMV-4, SMV-14)', () => {
  it('muestra siempre M, sin aviso de truncado por debajo del tope', async () => {
    mapResult(120);
    const html = await render({ view: 'map' });
    expect(html).toContain('120 viviendas con ubicación coinciden');
    expect(html).not.toContain('Mostrando');
    // D.8a (SMV-17): M vive en la sección del mapa; el resumen compartido lleva el de la lista.
    expect(mapSection(html)).toContain('120 viviendas con ubicación coinciden');
    expect(count(html, '120 viviendas con ubicación coinciden')).toBe(1);
  });

  it('exactamente en el tope (500 de 500) no hay aviso de truncado', async () => {
    mapResult(500);
    const html = await render({ view: 'map' });
    expect(html).toContain('500 viviendas con ubicación coinciden');
    expect(html).not.toContain('Mostrando');
  });

  it('truncado: "Mostrando 500 de M" solo cuando M supera el tope', async () => {
    mapResult(500, 2000);
    const html = await render({ view: 'map' });
    expect(html).toContain('2000 viviendas con ubicación coinciden');
    expect(count(html, 'Mostrando 500 de 2000')).toBe(1);
    expect(mapSection(html)).toContain('Mostrando 500 de 2000');
    expect(listSection(html)).not.toContain('Mostrando');
  });

  it('sin polígono explica que M puede diferir del total de la lista; con polígono no', async () => {
    mapResult(10);
    const without = await render({ view: 'map' });
    expect(without).toContain('puede diferir del total de la lista');
    expect(without).toContain('las viviendas sin ubicación no aparecen en el mapa');
    expect(count(without, 'puede diferir del total de la lista')).toBe(1);
    expect(mapSection(without)).toContain('puede diferir del total de la lista');

    mapResult(10);
    const withPolygon = await render({ view: 'map', polygon: POLYGON });
    expect(withPolygon).not.toContain('puede diferir del total de la lista');
  });

  it('D.8a: la vista de mapa ya no reemplaza a la lista; `page` solo afecta a la lista', async () => {
    mapResult(3);
    const html = await render({ view: 'map', page: '3' });
    expect(searchPropertiesMock).toHaveBeenCalledTimes(1);
    expect(searchMapPointsMock).toHaveBeenCalledTimes(1);
    expect(html).toContain('3 viviendas con ubicación coinciden');
    expect(propsOf(html).points).toHaveLength(3);
  });
});

describe('vista de mapa — puntos, avisos y atribución (SMV-5..SMV-9)', () => {
  it('pasa a SearchMap como máximo 500 puntos con priceLabel y href construidos en el servidor', async () => {
    searchMapPointsMock.mockResolvedValue({
      points: [makePoint(1), { ...makePoint(2), minPriceCents: null, anchorListingId: null }],
      total: 2,
      truncated: false,
    });
    const props = propsOf(await render({ view: 'map' }));
    expect(props.points.length).toBeLessThanOrEqual(500);
    expect(props.points[0]?.priceLabel).toBe(formatPriceCents(100001));
    expect(props.points[0]?.href).toBe('/properties/00000000-0000-4000-8000-000000000001');
    expect(props.points[1]?.priceLabel).toBe('Precio no disponible');
    expect(props.points[1]?.href).toBeNull();
    expect(Object.keys(props.points[0] ?? {}).sort()).toEqual([
      'href',
      'id',
      'lat',
      'lon',
      'priceLabel',
    ]);
  });

  it.each([{ view: 'map' }, { view: 'list' }, {}])(
    'con %j: un único aviso de ubicación aproximada y una atribución de OSM, ambos en la sección del mapa',
    async (params) => {
      mapResult(5);
      const html = await render(params);
      const attribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      expect(count(html, 'pueden ser aproximadas')).toBe(1);
      expect(mapSection(html)).toContain('pueden ser aproximadas');
      expect(count(html, attribution)).toBe(1);
      expect(mapSection(html)).toContain(attribution);
    }
  );

  it('fallback sin JS: noscript idéntico, una vez, DENTRO del marco del mapa, y recuento en el HTML', async () => {
    mapResult(7);
    const html = await render({ view: 'map', operation: 'sale' });
    const noscript =
      '<noscript><p>El mapa interactivo necesita JavaScript.</p><a href="/?operation=sale">Ver la lista de resultados</a></noscript>';
    expect(count(html, '<noscript>')).toBe(1);
    expect(html).toContain(noscript);
    expect(html).toMatch(
      /<div class="search-map__frame">[\s\S]*<noscript>[\s\S]*<\/noscript><\/div>/
    );
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf('search-map__frame'));
    expect(html).toContain('7 viviendas con ubicación coinciden');
  });

  it('el polígono activo viaja a SearchMap y el chip «Zona dibujada» lo quita conservando filtros y sin page', async () => {
    mapResult(4);
    const html = await render({ view: 'map', polygon: POLYGON, operation: 'sale', page: '2' });
    const props = propsOf(html);
    expect(props.polygon).toHaveLength(4);
    expect(props.polygon?.[0]).toEqual({ lat: 40.4, lon: -3.7 });
    expect(html).toMatch(
      /<a [^>]*href="\/\?view=map&amp;operation=sale"[^>]*>[\s\S]*?Zona dibujada/
    );
    expect(html).not.toContain('Quitar zona dibujada');
  });
});

describe('vista de mapa — estados vacío y de error (SMV-13, DAS-11)', () => {
  it('cero coincidencias: mensaje de vacío, sin truncado, el mapa sigue disponible', async () => {
    mapResult(0);
    const html = await render({ view: 'map' });
    expect(html).toContain('Todavía no hay viviendas con ubicación.');
    expect(html).not.toContain('Mostrando');
    expect(html).not.toContain(NOT_COVERED);
    expect(html).toContain('data-testid="search-map"');
  });

  it('cero coincidencias con polígono solo: el aviso de fuera de cobertura es la única explicación, sin condición de página', async () => {
    mapResult(0);
    const html = await render({ view: 'map', polygon: POLYGON, page: '4' });
    for (const line of EMPTY_LINES) {
      expect(html).not.toContain(line);
    }
    expect(html).toContain(NOT_COVERED);
    expect(html).toContain(NO_SWEEPS);
    // D.8a (SMV-17): una sola vez, en la región compartida, antes de las secciones.
    expect(count(html, NOT_COVERED)).toBe(1);
    expect(html.indexOf(NOT_COVERED)).toBeLessThan(html.indexOf('search-results__list"'));
  });

  it.each([{ view: 'list' }, { view: 'map' }, {}])(
    'polígono y M=0 con %j: el aviso aparece exactamente una vez y la lista y el mapa dicen su vacío',
    async (params) => {
      mapResult(0);
      const html = await render({ ...params, polygon: POLYGON });
      expect(count(html, NOT_COVERED)).toBe(1);
      expect(count(html, 'role="status"')).toBe(1);
      expect(html).not.toContain('aria-live');
      expect(html).not.toContain(RELOAD_LINK);
      for (const line of EMPTY_LINES) {
        expect(count(html, line)).toBe(0);
      }
      expect(count(html, 'Quitar «Zona dibujada»')).toBe(0);
    }
  );

  // D.14 (D13) — polígono sin viviendas MÁS otro filtro: el aviso y la guía `filtered`, que
  // nunca ofrece quitar el polígono.
  it.each([{ view: 'list' }, { view: 'map' }, {}])(
    'polígono, operación=sale y M=0 con %j: aviso una vez y guía filtered con una sola acción que conserva el polígono',
    async (params) => {
      mapResult(0);
      const html = await render({ ...params, polygon: POLYGON, operation: 'sale' });
      expect(count(html, NOT_COVERED)).toBe(1);
      expect(count(html, 'role="status"')).toBe(1);
      expect(count(html, 'Ninguna vivienda coincide con tu búsqueda.')).toBe(1);
      expect(count(html, 'Ninguna vivienda con ubicación coincide con tu búsqueda.')).toBe(1);
      expect(listSection(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
      expect(mapSection(html)).toContain('Ninguna vivienda con ubicación coincide con tu búsqueda.');
      // D.18 (decisión 225): una sola acción que conserva el polígono; ningún «Quitar «…»» por filtro.
      expect(count(html, 'Quitar «')).toBe(0);
      expect(count(listSection(html), 'Quitar los demás filtros')).toBe(1);
      expect(listSection(html)).not.toContain('Quitar todos los filtros');
    }
  );

  it('polígono + operación + tipo: «Quitar los demás filtros» conserva el polígono; la barra sigue quitándolo', async () => {
    mapResult(0);
    const html = await render({ view: 'map', polygon: POLYGON, operation: 'sale', propertyType: 'flat' });
    const encoded = new URLSearchParams({ polygon: POLYGON }).toString().replaceAll('&', '&amp;');
    expect(listSection(html)).toContain(`href="/?view=map&amp;${encoded}">Quitar los demás filtros</a>`);
    expect(count(html, 'Quitar los demás filtros')).toBe(1);
    expect(count(html, 'Quitar «Zona dibujada»')).toBe(0);
    // La barra de filtros aplicados conserva su nombre y su destino: quita el polígono también.
    expect(html).toMatch(/href="\/\?view=map"[^>]*>Quitar todos<span class="sr-only"> los filtros<\/span>/);
  });

  it('con polígono y M>0 el aviso no aparece aunque la página de la lista esté vacía', async () => {
    mapResult(4);
    const html = await render({ polygon: POLYGON, page: '2' });
    expect(html).not.toContain(NOT_COVERED);
    expect(listSection(html)).toContain('Esta página ya no tiene viviendas.');
  });

  it('sin polígono, página pasada del final: past-last-page con enlace a la primera página y sin «Quitar»', async () => {
    const html = await render({ operation: 'sale', page: '99' });
    expect(count(html, 'Esta página ya no tiene viviendas.')).toBe(1);
    expect(listSection(html)).toContain('href="/?operation=sale">Ir a la primera página</a>');
    expect(listSection(html)).not.toContain('Quitar');
  });

  it('parámetro inválido: el mismo rechazo nombrado, sin consultar ni pintar mapa', async () => {
    const polygon = await render({ view: 'map', polygon: 'abc' });
    expect(polygon).toContain('role="alert"');
    expect(polygon).toContain('Zona dibujada: ');
    expect(polygon).not.toContain('data-testid="search-map"');

    const view = await render({ view: 'satellite' });
    expect(view).toContain('role="alert"');
    expect(view).toContain('Vista: elige lista o mapa.');
    expect(searchMapPointsMock).not.toHaveBeenCalled();
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });

  it('un polígono junto a zone se rechaza nombrando ambos parámetros', async () => {
    const html = await render({ view: 'map', polygon: POLYGON, zone: '28079' });
    expect(html).toContain('Zona dibujada: no puede combinarse con el municipio; usa solo una forma de indicar la zona.');
    expect(resolveZoneGeometryMock).not.toHaveBeenCalled();
  });
});

describe('polígono y vista de mapa nunca tocan cobertura (PS-5, DAS-11)', () => {
  it('ni cobertura, ni señal de demanda, ni cuota, ni sugerencias', async () => {
    mapResult(0);
    await render({ view: 'map', polygon: POLYGON });
    searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: false });
    await render({ polygon: POLYGON });
    for (const mock of [
      resolveZoneGeometryMock,
      resolveCoverageForZoneMock,
      resolveNewZonesDailyCapMock,
      resolveCoverageClientLimitMock,
      getCoverageDbMock,
      recordSignalMock,
      suggestZonesMock,
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });
});

describe('vista de lista — aviso de fuera de cobertura y conmutador (DAS-11, SMV-1, SMV-16)', () => {
  it('sin polígono no hay aviso de fuera de cobertura', async () => {
    const html = await render({});
    expect(html).not.toContain(NOT_COVERED);
  });

  it('el enlace a la vista de mapa conserva los parámetros y descarta page; está en el DOM si hay resultados', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [makeListResult(0)], hasNextPage: false });
    const html = await render({ operation: 'sale', page: '3' });
    expect(html).toContain('<a href="/?operation=sale&amp;view=map">Ver mapa</a>');
    expect(html).toContain('class="view-toggle"');
  });

  it('en la vista de mapa, el enlace a la lista conserva los parámetros y descarta view y page', async () => {
    mapResult(1);
    const html = await render({ view: 'map', operation: 'sale', page: '3' });
    expect(html).toContain('<a href="/?operation=sale">Ver lista</a>');
  });
});

// D.13 (decisión 181) — la página monta el aviso único según el resultado de cobertura.
describe('avisos de cobertura de la página (D.13)', () => {
  const ZONE = '28074';
  const geometry = {
    zoneId: 'zone-1',
    ineCode: ZONE,
    municipality: 'Leganés',
    state: 'uncovered',
    centroid: { latitude: 40.33, longitude: -3.76 },
    sweepRadiusM: 4500,
  };

  function job(status: 'pending' | 'running' | 'done' | 'failed'): unknown {
    return {
      kind: 'registered',
      job: {
        status,
        attempts: 0,
        requestedAt: new Date('2026-10-08T12:00:00Z'),
        startedAt: null,
        error: 'boom interno',
      },
    };
  }

  async function renderZone(
    outcome: unknown,
    extra: Record<string, string> = {}
  ): Promise<string> {
    resolveZoneGeometryMock.mockResolvedValue(geometry);
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue(outcome);
    return render({ zone: ZONE, ...extra });
  }

  it('registrada sin job (V4): título de solicitud registrada y enlace de recarga plano', async () => {
    const html = await renderZone({ kind: 'registered', job: null });
    expect(html).toContain('Tu solicitud de actualización de Leganés está registrada.');
    expect(count(html, RELOAD_LINK)).toBe(1);
    expect(html).toContain('<a href="/?zone=28074">Comprobar de nuevo</a>');
    expect(html).toContain('aria-label="Actualización de la zona"');
    expect(html).not.toContain('data-testid="coverage-status"');
  });

  it.each([['pending'], ['running'], ['done']] as const)(
    'job %s: una región status, enlace de recarga y CoverageStatus montado',
    async (status) => {
      const html = await renderZone(job(status));
      expect(count(html, 'role="status"')).toBe(1);
      expect(count(html, 'role="alert"')).toBe(0);
      expect(count(html, RELOAD_LINK)).toBe(1);
      expect(html).toContain('data-testid="coverage-status"');
      expect(html).not.toContain('aria-live');
      expect(html).not.toContain('boom interno');
    }
  );

  it('job failed: la región es un alert, sin job.error, con enlace de recarga', async () => {
    const html = await renderZone(job('failed'));
    expect(count(html, 'role="alert"')).toBe(1);
    expect(count(html, 'role="status"')).toBe(0);
    expect(html).toContain('La actualización de Leganés ha fallado.');
    expect(html).not.toContain('boom interno');
    expect(count(html, RELOAD_LINK)).toBe(1);
  });

  it.each([
    [{ kind: 'not-sweepable' }, 'Todavía no hay viviendas de Leganés.'],
    [{ kind: 'cap-exhausted' }, 'límite diario de zonas nuevas'],
    [{ kind: 'client-cap-exhausted' }, 'tu límite personal'],
  ])('%j: aviso sin enlace de recarga ni sondeo', async (outcome, text) => {
    const html = await renderZone(outcome);
    expect(html).toContain(text);
    expect(count(html, 'role="status"')).toBe(1);
    expect(html).not.toContain(RELOAD_LINK);
    expect(html).not.toContain('data-testid="coverage-status"');
    expect(html).not.toMatch(/UTC|mañana|barrido/);
  });

  it('tope agotado: la hora de reinicio va en hora de Madrid, sin palabra de día', async () => {
    const html = await renderZone({ kind: 'cap-exhausted' });
    expect(html).toMatch(/a partir de las <time[^>]*>\d{1,2}:00<\/time> de la madrugada/);
  });

  it('zona desconocida (V10): aviso literal sin enlace de recarga', async () => {
    resolveZoneGeometryMock.mockResolvedValue(null);
    const html = await render({ zone: '00000' });
    expect(html).toContain('El enlace lleva un municipio que no existe.');
    expect(count(html, 'role="status"')).toBe(1);
    expect(html).not.toContain(RELOAD_LINK);
  });

  it('zona cubierta: sin aviso de cobertura', async () => {
    resolveZoneGeometryMock.mockResolvedValue({ ...geometry, state: 'covered' });
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'covered' });
    const html = await render({ zone: ZONE });
    expect(html).not.toContain('coverage-notice');
  });
});

// D.18 (decisión 225, enmienda la 190) — estado vacío filtrado: estado, la frase que remite a los
// chips y UNA acción siempre visible. La zona es un filtro aplicado más (decisión 224), así que
// «Quitar todos los filtros» también la quita; el aviso de cobertura explica la causa.
describe('estado vacío filtrado con una sola acción (D.18)', () => {
  const geometry = {
    zoneId: 'zone-1',
    ineCode: '28074',
    municipality: 'Leganés',
    state: 'uncovered',
    centroid: { latitude: 40.33, longitude: -3.76 },
    sweepRadiusM: 4500,
  };
  const SENTENCE = 'Los filtros aplicados están arriba; pulsa uno para quitarlo';

  async function renderUncovered(extra: Record<string, string>): Promise<string> {
    resolveZoneGeometryMock.mockResolvedValue(geometry);
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'not-sweepable' });
    suggestZonesMock.mockResolvedValue([]);
    return render({ zone: '28074', ...extra });
  }

  // Refinamiento de C-11 (decisión de la persona usuaria): con dos o más chips la fila ya ofrece «Quitar
  // todos», así que el estado vacío no repite un enlace idéntico; con un solo chip sí ofrece la acción.
  it('zona + operación: la fila de chips ya ofrece «Quitar todos»; el estado vacío no repite el enlace', async () => {
    const html = await renderUncovered({ operation: 'sale' });
    expect(count(html, 'Todavía no hay viviendas de Leganés.')).toBe(1);
    expect(count(html, 'role="status"')).toBe(1);
    const list = listSection(html);
    expect(list).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(list).toContain(SENTENCE);
    expect(mapSection(html)).toContain('Ninguna vivienda con ubicación coincide con tu búsqueda.');
    expect(list).not.toContain('empty-results__action');
    expect(list).not.toContain('>Quitar');
    // El único «Quitar todos» de la página es el de la fila de chips, fuera de la sección de resultados.
    expect(count(html, 'Quitar todos<span class="sr-only"> los filtros</span>')).toBe(1);
    expect(count(html, 'Quitar todos los filtros</a>')).toBe(0);
  });

  it('zona sola: sigue siendo un filtro, así que el vacío es filtered y la acción quita la zona', async () => {
    const html = await renderUncovered({});
    expect(count(html, 'role="status"')).toBe(1);
    const list = listSection(html);
    expect(list).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(list).toContain('<a href="/">Quitar todos los filtros</a>');
    expect(list).not.toContain('Todavía no hay viviendas.');
  });

  it('zona sola con view y sort: la acción conserva view y sort y quita la zona', async () => {
    const html = await renderUncovered({ view: 'map', sort: 'price' });
    expect(listSection(html)).toContain('href="/?view=map&amp;sort=price">Quitar todos los filtros</a>');
    expect(html).not.toContain('sr-only"> los filtros');
  });

  it('con tres filtros no hay acción en el estado vacío y la fila de chips sí ofrece «Quitar todos»', async () => {
    const html = await renderUncovered({ operation: 'sale', propertyType: 'flat', view: 'map', sort: 'price' });
    expect(listSection(html)).not.toContain('>Quitar');
    expect(html).toMatch(/href="\/\?view=map&amp;sort=price"[^>]*>Quitar todos<span class="sr-only"> los filtros<\/span>/);
  });

  it('polígono sin viviendas con otro filtro: la acción se llama «Quitar los demás filtros» y conserva el polígono', async () => {
    const html = await render({ polygon: POLYGON, operation: 'sale' });
    const encoded = new URLSearchParams({ polygon: POLYGON }).toString().replaceAll('&', '&amp;');
    expect(listSection(html)).toContain(`href="/?${encoded}">Quitar los demás filtros</a>`);
    expect(count(listSection(html), '>Quitar')).toBe(1);
  });

  it('zona cubierta con filtros: filtered, sin aviso de cobertura y sin acción repetida', async () => {
    resolveZoneGeometryMock.mockResolvedValue({ ...geometry, state: 'covered' });
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'covered' });
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    const html = await render({ zone: '28074', operation: 'sale' });
    expect(html).not.toContain('coverage-notice');
    expect(listSection(html)).toContain('Ninguna vivienda coincide con tu búsqueda.');
    expect(listSection(html)).toContain(SENTENCE);
    expect(count(listSection(html), '>Quitar')).toBe(0);
  });
});

// D.15 (F2, R7, decisión 194) — ayuda de teclado del mapa, visible y en el HTML del servidor, a la
// que apunta `aria-describedby` del contenedor de Leaflet (lo pone el lienzo en el cliente).
describe('ayuda de teclado del mapa (D.15, F2)', () => {
  it('el párrafo con id va tras el marco del mapa, con texto visible sobre flechas, zoom y marcadores', async () => {
    mapResult(2);
    const html = await render({});
    const section = mapSection(html);
    const frameEnd = section.indexOf('</noscript></div>');
    const help = section.indexOf('<p id="map-keyboard-help"');
    expect(frameEnd).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(frameEnd);
    const paragraph = /<p id="map-keyboard-help"[^>]*>([^<]*)<\/p>/.exec(section);
    expect(paragraph?.[1]).toContain('flechas');
    expect(paragraph?.[1]).toContain('Tab');
    expect(paragraph?.[0]).not.toContain('sr-only');
  });

  it('el id viaja al mapa como `keyboardHelpId`, y sin mapa no hay ayuda', async () => {
    mapResult(1);
    const html = await render({ view: 'map' });
    expect(propsOf(html)).toMatchObject({ keyboardHelpId: 'map-keyboard-help' });
    expect(count(html, 'id="map-keyboard-help"')).toBe(1);

    const rejected = await render({ view: 'satellite' });
    expect(rejected).not.toContain('map-keyboard-help');
  });
});

// D.18 (decisión 224, replaza la 213 y enmienda la 190) — una zona con centroide y radio de barrido
// SIEMPRE se aplica, cubierta o no: sin sufijo en el chip ni rótulo sobre la lista. Una zona
// inlocalizable (desconocida, sin centroide o sin radio) no consulta nada: lista vacía y su aviso.
describe('zona siempre aplicada (D.18, decisión 224)', () => {
  const CAPTION = 'Mientras tanto, viviendas de todos los municipios';
  const geometry = {
    zoneId: 'zone-1',
    ineCode: '28074',
    municipality: 'Leganés',
    state: 'uncovered',
    centroid: { latitude: 40.33, longitude: -3.76 },
    sweepRadiusM: 4500,
  };
  const GEO = { lon: -3.76, lat: 40.33, radiusMeters: 4500 };

  function withResults(): void {
    searchPropertiesMock.mockResolvedValue({
      results: [makeListResult(0), makeListResult(1)],
      hasNextPage: false,
    });
    mapResult(2);
  }

  function uncovered(overrides: Record<string, unknown> = {}): void {
    resolveZoneGeometryMock.mockResolvedValue({ ...geometry, ...overrides });
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'not-sweepable' });
  }

  function callCriteria(mock: typeof searchPropertiesMock): { geo?: unknown } {
    return mock.mock.calls[0]?.[1] as { geo?: unknown };
  }

  it.each([
    ['uncovered', 'sin cubrir'],
    ['covered', 'cubierta'],
  ])('zona %s (%s) con centroide y radio: las dos consultas reciben el geo de la zona', async (state) => {
    withResults();
    uncovered({ state });
    await render({ zone: '28074' });
    expect(searchPropertiesMock).toHaveBeenCalledTimes(1);
    expect(searchMapPointsMock).toHaveBeenCalledTimes(1);
    expect(callCriteria(searchPropertiesMock).geo).toEqual(GEO);
    expect(callCriteria(searchMapPointsMock).geo).toEqual(GEO);
  });

  it('zona sin cubrir con resultados: chip sin sufijo, sin rótulo y con su aviso de cobertura', async () => {
    withResults();
    uncovered();
    const html = await render({ zone: '28074' });
    expect(html).toContain('Zona: Leganés');
    expect(html).not.toContain('sin datos todavía');
    expect(html).not.toContain(CAPTION);
    expect(html).not.toContain('search-results__caption');
    expect(html).toContain('Todavía no hay viviendas de Leganés.');
  });

  it('el chip sigue siendo un enlace que quita la zona', async () => {
    withResults();
    uncovered();
    const html = await render({ zone: '28074', operation: 'sale' });
    expect(html).toContain('href="/?operation=sale"');
    expect(html).toContain('Zona: Leganés');
  });

  it('zona cubierta con resultados: ni sufijo ni rótulo ni aviso', async () => {
    withResults();
    uncovered({ state: 'covered' });
    resolveCoverageForZoneMock.mockResolvedValue({ kind: 'covered' });
    const html = await render({ zone: '28074' });
    expect(html).toContain('Zona: Leganés');
    expect(html).not.toContain('sin datos todavía');
    expect(html).not.toContain(CAPTION);
    expect(html).not.toContain('coverage-notice');
  });

  it.each([
    ['sin centroide', { centroid: null }],
    ['sin radio de barrido', { sweepRadiusM: null }],
  ])('zona %s: no consulta nada, la lista queda vacía y su aviso la explica', async (_name, overrides) => {
    withResults();
    uncovered(overrides);
    const html = await render({ zone: '28074' });
    expect(searchPropertiesMock).not.toHaveBeenCalled();
    expect(searchMapPointsMock).not.toHaveBeenCalled();
    expect(html).toContain('Zona: Leganés');
    expect(html).toContain('0 resultados');
    expect(html).toContain('0 viviendas con ubicación coinciden');
    expect(html).toContain('Todavía no hay viviendas de Leganés.');
    expect(html).not.toContain('result-list');
  });

  it('zona desconocida: no consulta nada, lista vacía y el aviso de municipio inexistente', async () => {
    withResults();
    resolveZoneGeometryMock.mockResolvedValue(null);
    const html = await render({ zone: '00000' });
    expect(searchPropertiesMock).not.toHaveBeenCalled();
    expect(searchMapPointsMock).not.toHaveBeenCalled();
    expect(html).toContain('Zona INE 00000');
    expect(html).toContain('El enlace lleva un municipio que no existe.');
    expect(html).toContain('0 resultados');
    expect(html).not.toContain('result-list');
  });

  it('una zona inlocalizable con otros filtros sigue sin consultar: no degrada a una búsqueda sin zona', async () => {
    withResults();
    resolveZoneGeometryMock.mockResolvedValue(null);
    await render({ zone: '00000', operation: 'sale' });
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });
});

// D.17 (B5) — el aviso de actualización de la zona es un solo panel: el estado, la frase de
// refresco automático y, al final, el enlace de recarga.
describe('panel de actualización de la zona (D.17, B5)', () => {
  const geometry = {
    zoneId: 'zone-1',
    ineCode: '28074',
    municipality: 'Leganés',
    state: 'uncovered',
    centroid: { latitude: 40.33, longitude: -3.76 },
    sweepRadiusM: 4500,
  };

  async function renderOutcome(outcome: unknown): Promise<string> {
    resolveZoneGeometryMock.mockResolvedValue(geometry);
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue(outcome);
    return render({ zone: '28074' });
  }

  function panelOf(html: string): string {
    const start = html.indexOf('<section aria-label="Actualización de la zona"');
    if (start === -1) {
      throw new Error('Falta el panel de actualización');
    }
    return html.slice(start, html.indexOf('</section>', start));
  }

  const job = {
    kind: 'registered',
    job: { status: 'pending', attempts: 0, requestedAt: new Date('2026-10-08T12:00:00Z'), startedAt: null, error: null },
  };

  it('con job: aviso, frase de refresco y enlace de recarga al final, todo dentro del panel', async () => {
    const panel = panelOf(await renderOutcome(job));
    const notice = panel.indexOf('class="coverage-notice"');
    const status = panel.indexOf('data-testid="coverage-status"');
    const link = panel.indexOf(RELOAD_LINK);
    expect(notice).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(notice);
    expect(link).toBeGreaterThan(status);
    expect(panel.slice(link + RELOAD_LINK.length)).not.toMatch(/<(a|p)[ >]/);
    expect(panel).toContain('class="coverage-panel"');
  });

  it('sin job: aviso y enlace de recarga al final, sin frase de refresco', async () => {
    const panel = panelOf(await renderOutcome({ kind: 'registered', job: null }));
    expect(panel.indexOf(RELOAD_LINK)).toBeGreaterThan(panel.indexOf('class="coverage-notice"'));
    expect(panel).not.toContain('data-testid="coverage-status"');
  });
});

// D.17 (B3) — sobre el mapa solo va el recuento; los avisos viajan en el pie, tras el marco.
describe('pie del mapa (D.17, B3)', () => {
  const COUNT_CAVEAT = 'Este recuento puede diferir del total de la lista';
  const APPROX = 'Las posiciones del mapa pueden ser aproximadas.';

  it('antes del marco solo está el recuento; los dos avisos van tras el marco, con la ayuda de teclado', async () => {
    mapResult(2);
    const section = mapSection(await render({}));
    const frame = section.indexOf('<div class="search-map__frame">');
    const before = section.slice(0, frame);
    expect(before).toContain('2 viviendas con ubicación coinciden');
    expect(before).not.toContain(COUNT_CAVEAT);
    expect(before).not.toContain(APPROX);
    const notes = section.slice(section.indexOf('</noscript></div>'));
    expect(notes).toContain('id="map-keyboard-help"');
    expect(notes).toContain(COUNT_CAVEAT);
    expect(notes).toContain(APPROX);
    expect(notes).toContain('class="search-map__notes"');
  });

  it('con polígono no hay aviso de diferencia de recuento, pero sí el de posiciones', async () => {
    mapResult(2);
    const html = await render({ polygon: POLYGON });
    expect(html).not.toContain(COUNT_CAVEAT);
    expect(mapSection(html)).toContain(APPROX);
  });

  // D.17 (A, correccion de la revision por captura): con 0 puntos la frase del vacio tampoco
  // empuja el marco; va en el pie, para que el mapa quede alineado con la primera caja de la lista.
  it.each([
    { name: 'filtrado', params: { operation: 'sale' }, sentence: 'Ninguna vivienda con ubicación coincide con tu búsqueda.' },
    { name: 'sin filtros', params: {}, sentence: 'Todavía no hay viviendas con ubicación.' },
  ])('mapa vacío $name: la frase del vacío va en el pie y no entre el recuento y el marco', async ({ params, sentence }) => {
    mapResult(0);
    const section = mapSection(await render(params));
    const frame = section.indexOf('<div class="search-map__frame">');
    expect(section.slice(0, frame)).not.toContain(sentence);
    expect(section.slice(0, frame)).toContain('<p class="font-semibold tabular-nums">');
    const notes = section.slice(section.indexOf('</noscript></div>'));
    expect(notes).toContain(sentence);
    expect(notes).toContain('class="search-map__notes"');
  });

  it('con puntos truncados, «Mostrando N de M» sigue junto al recuento, sobre el mapa', async () => {
    mapResult(2, 5);
    const section = mapSection(await render({}));
    const before = section.slice(0, section.indexOf('<div class="search-map__frame">'));
    expect(before).toContain('Mostrando 2 de 5');
  });
});

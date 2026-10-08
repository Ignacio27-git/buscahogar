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

const { default: HomePage } = await import('../src/app/page.js');

const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';
const NOT_COVERED = 'No hay viviendas en la zona dibujada.';
const NO_SWEEPS = 'Dibujar una zona no pide su actualización';
const RELOAD_LINK = '>Comprobar de nuevo</a>';

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

  it('el título, los filtros aplicados y el aviso de polígono van juntos en .search-header, antes de los resultados', async () => {
    const html = await render({ polygon: POLYGON });
    const start = html.indexOf('<div class="search-header">');
    const end = html.indexOf('class="search-results"');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const header = html.slice(start, end);
    expect(header).toContain('<h1');
    expect(header).toContain('aria-label="Filtros aplicados"');
    expect(header).toContain('coverage-notice');
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

  it('sin resultados la lista dice su vacío y el mapa el suyo, una vez cada uno', async () => {
    const html = await render({});
    expect(count(html, 'No se encontraron viviendas con esos filtros.')).toBe(1);
    expect(listSection(html)).toContain('No se encontraron viviendas con esos filtros.');
    expect(count(html, 'Ninguna vivienda con ubicación coincide con estos filtros')).toBe(1);
    expect(mapSection(html)).toContain('Ninguna vivienda con ubicación coincide con estos filtros');
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
    expect(html).toContain('Ninguna vivienda con ubicación coincide con estos filtros');
    expect(html).not.toContain('Mostrando');
    expect(html).not.toContain(NOT_COVERED);
    expect(html).toContain('data-testid="search-map"');
  });

  it('cero coincidencias con polígono: vacío + aviso de fuera de cobertura sin condición de página', async () => {
    mapResult(0);
    const html = await render({ view: 'map', polygon: POLYGON, page: '4' });
    expect(html).toContain('Ninguna vivienda con ubicación coincide con estos filtros');
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
      expect(count(html, 'No se encontraron viviendas con esos filtros.')).toBe(1);
      expect(count(html, 'Ninguna vivienda con ubicación coincide con estos filtros')).toBe(1);
    }
  );

  it('con polígono y M>0 el aviso no aparece aunque la página de la lista esté vacía', async () => {
    mapResult(4);
    const html = await render({ polygon: POLYGON, page: '2' });
    expect(html).not.toContain(NOT_COVERED);
  });

  it('parámetro inválido: el mismo rechazo nombrado, sin consultar ni pintar mapa', async () => {
    const polygon = await render({ view: 'map', polygon: 'abc' });
    expect(polygon).toContain('role="alert"');
    expect(polygon).toContain('polygon');
    expect(polygon).not.toContain('data-testid="search-map"');

    const view = await render({ view: 'satellite' });
    expect(view).toContain('role="alert"');
    expect(view).toContain('view');
    expect(searchMapPointsMock).not.toHaveBeenCalled();
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });

  it('un polígono junto a zone se rechaza nombrando ambos parámetros', async () => {
    const html = await render({ view: 'map', polygon: POLYGON, zone: '28079' });
    expect(html).toContain('polygon no puede combinarse con zone');
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

  it('el enlace a la vista de mapa conserva los parámetros y descarta page; está siempre en el DOM', async () => {
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

  async function renderZone(outcome: unknown): Promise<string> {
    resolveZoneGeometryMock.mockResolvedValue(geometry);
    resolveNewZonesDailyCapMock.mockReturnValue(10);
    resolveCoverageClientLimitMock.mockResolvedValue(null);
    resolveCoverageForZoneMock.mockResolvedValue(outcome);
    return render({ zone: ZONE });
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

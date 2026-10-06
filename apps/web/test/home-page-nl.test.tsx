// ROADMAP 3.1 (decisión 122/123, spec natural-language-search-form) — la rama
// `?q=` de la página `/`: interpreta y pide confirmación, nunca busca. Misma
// técnica que `home-page-map.test.tsx`: invocación directa de la página con
// `@buscahogar/db`, cobertura y señal de demanda sustituidos por dobles.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/server/coverage-client', () => ({ resolveCoverageClientLimit: resolveCoverageClientLimitMock }));
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
vi.mock('@/components/search-map', async () => {
  const { createElement } = await import('react');
  return { SearchMap: (): unknown => createElement('div', { 'data-testid': 'search-map' }) };
});

const { default: HomePage } = await import('../src/app/page.js');

async function render(params: Record<string, string | string[] | undefined>): Promise<string> {
  return renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(params) }));
}

function zone(
  municipality: string,
  ineCode: string,
  province = 'Madrid'
): { ineCode: string; municipality: string; province: string; state: string; sweepable: boolean } {
  return { ineCode, municipality, province, state: 'covered', sweepable: true };
}

// React no garantiza el orden de los atributos en el HTML (p. ej. `checked`
// sale antes que `value`), así que las comprobaciones buscan la etiqueta que
// contiene todos los fragmentos, sin depender del orden.
function findTag(html: string, tagName: string, ...needles: string[]): string | undefined {
  const tags = html.match(new RegExp(`<${tagName}[ >][^>]*>?`, 'g')) ?? [];
  return tags.find((tag) => needles.every((needle) => tag.includes(needle)));
}

function zoneRadio(html: string, value: string): string | undefined {
  return findTag(html, 'input', 'name="zone"', `value="${value}"`);
}

const SIDE_EFFECT_MOCKS = [
  searchPropertiesMock,
  searchMapPointsMock,
  resolveZoneGeometryMock,
  resolveCoverageForZoneMock,
  resolveNewZonesDailyCapMock,
  resolveCoverageClientLimitMock,
  getCoverageDbMock,
  recordSignalMock,
];

function expectNoSideEffects(): void {
  for (const mock of SIDE_EFFECT_MOCKS) {
    expect(mock).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  for (const mock of [...SIDE_EFFECT_MOCKS, suggestZonesMock]) {
    mock.mockReset();
  }
  suggestZonesMock.mockResolvedValue([]);
  searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: false });
});

describe('?q= interpreta sin buscar (spec "Interpret Without Searching")', () => {
  it('muestra el panel prefijado y no busca, ni registra cobertura, señal o cuota', async () => {
    suggestZonesMock.mockResolvedValue([zone('Getafe', '28065')]);
    const html = await render({ q: 'piso en alquiler en Getafe hasta 900 € con 2 habitaciones' });
    expect(html).toContain('<form');
    expect(html).toMatch(/<select[^>]*name="operation"[^>]*>[\s\S]*<option value="rent" selected/);
    expect(findTag(html, 'input', 'name="maxPrice"', 'value="900"')).toBeDefined();
    expect(findTag(html, 'input', 'name="minRooms"', 'value="2"')).toBeDefined();
    expect(zoneRadio(html, '28065')).toContain('checked');
    expectNoSideEffects();
    expect(suggestZonesMock).toHaveBeenCalledTimes(1);
    expect(suggestZonesMock.mock.calls[0]?.[1]).toBe('getafe');
  });

  it('el formulario de criterios es un GET con la marca form=criteria y campos con el nombre del parámetro', async () => {
    const html = await render({ q: 'piso en venta' });
    expect(findTag(html, 'form', 'method="get"', 'action="/"')).toBeDefined();
    expect(findTag(html, 'input', 'type="hidden"', 'name="form"', 'value="criteria"')).toBeDefined();
    for (const name of [
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
      'zone',
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it('cada campo del panel tiene etiqueta, los rangos van en fieldset con legend y hay opción "Sin zona"', async () => {
    const html = await render({ q: 'piso' });
    expect(html).toContain('<legend>Precio (€)</legend>');
    expect(html).toContain('<legend>Superficie (m²)</legend>');
    expect(html).toContain('Sin zona');
    expect(html).toMatch(/<label for="criteria-minPrice">/);
  });

  it('la caja de texto role=search está también en el modo búsqueda normal', async () => {
    const html = await render({ operation: 'sale' });
    expect(findTag(html, 'form', 'role="search"')).toBeDefined();
    expect(html).toContain('name="q"');
  });

  it('q junto a parámetros de criterio solo interpreta: no busca', async () => {
    await render({ q: 'piso en venta', operation: 'rent', maxPrice: '500' });
    expectNoSideEffects();
  });

  it('un lugar con varios municipios se ofrece para elegir y ninguno queda marcado', async () => {
    suggestZonesMock.mockResolvedValue([
      zone('Villanueva', '10001', 'Cáceres'),
      zone('Villanueva', '20002', 'Gipuzkoa'),
    ]);
    const html = await render({ q: 'piso en Villanueva' });
    expect(html).toContain('Villanueva (Cáceres)');
    expect(html).toContain('Villanueva (Gipuzkoa)');
    expect(zoneRadio(html, '10001')).not.toContain('checked');
    expect(zoneRadio(html, '')).toContain('checked');
    expectNoSideEffects();
  });

  it('una coincidencia solo por prefijo no se autoselecciona ("madrid" frente a "madridejos")', async () => {
    suggestZonesMock.mockResolvedValue([zone('Madridejos', '45093', 'Toledo')]);
    const html = await render({ q: 'piso en Madrid' });
    expect(html).toContain('Madridejos (Toledo)');
    expect(zoneRadio(html, '45093')).not.toContain('checked');
  });

  it('con coincidencia exacta y prefijos, selecciona la exacta', async () => {
    suggestZonesMock.mockResolvedValue([zone('Madrid', '28079'), zone('Madridejos', '45093', 'Toledo')]);
    const html = await render({ q: 'piso en Madrid' });
    expect(zoneRadio(html, '28079')).toContain('checked');
    expect(zoneRadio(html, '45093')).toBeUndefined();
  });

  it('un lugar inexistente no fija zona y se lista como no entendido', async () => {
    const html = await render({ q: 'piso en Atlantis' });
    expect(html).toContain('No he entendido:');
    expect(html).toContain('Atlantis');
    expect(zoneRadio(html, '')).toContain('checked');
    expectNoSideEffects();
  });

  it('sin lugar en el texto no se consulta la base de datos de zonas', async () => {
    await render({ q: 'piso en alquiler' });
    expect(suggestZonesMock).not.toHaveBeenCalled();
  });

  it('lista los fragmentos no entendidos y las indicaciones contradictorias', async () => {
    const html = await render({ q: 'piso con terraza en venta o alquiler' });
    expect(html).toContain('No he entendido:');
    expect(html).toContain('terraza');
    expect(html).toContain('Indicaciones contradictorias');
  });

  it('un rango invertido muestra el rechazo nombrado del esquema y deja los campos editables', async () => {
    const html = await render({ q: 'entre 900 y 600 euros' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('minPrice no puede ser mayor que maxPrice');
    expect(findTag(html, 'input', 'name="minPrice"', 'value="900"')).toBeDefined();
    expect(findTag(html, 'input', 'name="maxPrice"', 'value="600"')).toBeDefined();
    expectNoSideEffects();
  });

  it('q vacío, demasiado largo o repetido se rechaza con un aviso, sin interpretar ni buscar', async () => {
    const empty = await render({ q: '   ' });
    expect(empty).toContain('role="alert"');
    const long = await render({ q: 'a'.repeat(201) });
    expect(long).toContain('role="alert"');
    expect(long).toContain('200');
    const repeated = await render({ q: ['piso', 'casa'] });
    expect(repeated).toContain('role="alert"');
    expectNoSideEffects();
    expect(suggestZonesMock).not.toHaveBeenCalled();
  });
});

describe('confirmar el panel ejecuta la búsqueda normal (spec "Confirm")', () => {
  it('el envío con la marca y campos en blanco se limpia y busca', async () => {
    const html = await render({ form: 'criteria', operation: 'rent', maxPrice: '900', minPrice: '', zone: '' });
    expect(html).not.toContain('role="alert"');
    expect(searchPropertiesMock).toHaveBeenCalledTimes(1);
    const criteria = searchPropertiesMock.mock.calls[0]?.[1] as { operation?: string; maxPriceCents?: number };
    expect(criteria.operation).toBe('rent');
    expect(criteria.maxPriceCents).toBe(90000);
  });

  it('sin la marca, un minPrice vacío sigue rechazándose con nombre', async () => {
    const html = await render({ minPrice: '' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('minPrice');
    expect(searchPropertiesMock).not.toHaveBeenCalled();
  });

  it('los enlaces de paginación no arrastran la marca form', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: true });
    const html = await render({ form: 'criteria', operation: 'sale', minRooms: '' });
    expect(html).toContain('href="/?operation=sale&amp;page=2"');
    expect(html).not.toContain('form=criteria');
  });
});

// D.5 (app-shell R5): un único h1 «Buscar vivienda» en las ramas de la home y ni
// rastro del nombre antiguo ni de la línea de desarrollo. El `<main>` lo aporta el
// layout, así que la página no debe pintarlo.
describe('encabezado único de la home (D.5)', () => {
  it.each([
    ['rechazo de q vacío', { q: '' }],
    ['interpretación', { q: 'piso en alquiler' }],
    ['rechazo de parámetros', { minPrice: 'abc' }],
    ['resultados en lista', {}],
    ['resultados en mapa', { view: 'map' }],
  ] as const)('%s: exactamente un <h1>Buscar vivienda</h1>', async (_name, params) => {
    searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
    const html = await render({ ...params });
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('<h1>Buscar vivienda</h1>');
    expect(html).not.toContain('Agregador inmobiliario');
    expect(html).not.toContain('Esqueleto');
    expect(html).not.toContain('<main');
  });
});

// D.6a (spec search-filters) — la barra de filtros, los filtros aplicados y el
// recuento en la home, sin `?q=`. Mismo arnés que arriba.
const BAR = 'aria-label="Filtros de búsqueda"';
const POLYGON = '40.4,-3.7;40.4,-3.6;40.5,-3.6;40.5,-3.7';

function barForm(html: string): string {
  const start = html.indexOf(BAR);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</form>', start));
}

describe('barra de filtros en la home (D.6a, spec "Filter bar")', () => {
  it('la rama ?q= no la lleva y conserva un único role=search', async () => {
    const html = await render({ q: 'piso en venta' });
    expect(html).not.toContain(BAR);
    expect(html.match(/role="search"/g)).toHaveLength(1);
  });

  it('la rama válida la pinta bajo la caja de texto y SearchTextForm sigue siendo el único role=search', async () => {
    const html = await render({ operation: 'sale' });
    expect(html).toContain(BAR);
    expect(html.match(/role="search"/g)).toHaveLength(1);
    expect(html.indexOf('role="search"')).toBeLessThan(html.indexOf(BAR));
    expect(html).toContain('id="filter-operation"');
  });

  it('la barra nunca envía page y reenvía view y zone', async () => {
    searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
    resolveZoneGeometryMock.mockResolvedValue(null);
    const form = barForm(await render({ view: 'map', zone: '28079', page: '3' }));
    expect(findTag(form, 'input', 'type="hidden"', 'name="view"', 'value="map"')).toBeDefined();
    expect(findTag(form, 'input', 'type="hidden"', 'name="zone"', 'value="28079"')).toBeDefined();
    expect(form).not.toContain('name="page"');
  });

  it('parámetros inválidos con valores representables: alerta y entradas 900/100 editables (min > max)', async () => {
    const html = await render({ minPrice: '900', maxPrice: '100' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('minPrice no puede ser mayor que maxPrice.');
    const form = barForm(html);
    expect(findTag(form, 'input', 'name="minPrice"', 'value="900"')).toBeDefined();
    expect(findTag(form, 'input', 'name="maxPrice"', 'value="100"')).toBeDefined();
    expectNoSideEffects();
  });

  it('valores no representables: la alerta nombra el parámetro y la barra se pinta con el valor crudo', async () => {
    const html = await render({ minPrice: 'abc', operation: 'foo' });
    // El mensaje por defecto de Zod para un enum no nombra el parámetro: la
    // página lo antepone para que la alerta lo diga.
    expect(html).toMatch(/<p role="alert">[^<]*operation: [^<]*minPrice: |<p role="alert">[^<]*minPrice: [^<]*operation: /);
    const form = barForm(html);
    expect(findTag(form, 'input', 'type="number"', 'name="minPrice"', 'value="abc"')).toBeDefined();
    expect(form).not.toMatch(/<option value="(sale|rent)" selected/);
    expectNoSideEffects();
  });

  it('un oculto rechazado no se reenvía (polígono junto a zona) pero los demás sí', async () => {
    const html = await render({ polygon: POLYGON, zone: '28079', view: 'map' });
    expect(html).toContain('polygon no puede combinarse con zone');
    const form = barForm(html);
    expect(findTag(form, 'input', 'type="hidden"', 'name="polygon"')).toBeUndefined();
    expect(findTag(form, 'input', 'type="hidden"', 'name="zone"', 'value="28079"')).toBeDefined();
    expect(findTag(form, 'input', 'type="hidden"', 'name="view"', 'value="map"')).toBeDefined();
  });

  it('una vista inválida tampoco se reenvía', async () => {
    const html = await render({ view: 'foo', zone: '28079' });
    expect(html).toContain('role="alert"');
    const form = barForm(html);
    expect(findTag(form, 'input', 'type="hidden"', 'name="view"')).toBeUndefined();
    expect(findTag(form, 'input', 'type="hidden"', 'name="zone"')).toBeDefined();
  });

  it('la rama inválida no pinta chips ni recuento', async () => {
    const html = await render({ minPrice: '900', maxPrice: '100' });
    expect(html).not.toContain('Filtros aplicados');
    expect(html).not.toMatch(/\d+ resultados?/);
  });
});

describe('filtros aplicados y recuento en la home (D.6a)', () => {
  it('sin filtros: el recuento 0 resultados sigue y no hay chips ni «Quitar todos»', async () => {
    const html = await render({});
    expect(html).toContain('0 resultados');
    expect(html).not.toContain('Filtros aplicados');
    expect(html).not.toContain('Quitar');
  });

  it('con filtros: un chip por filtro y «Quitar todos» con dos o más', async () => {
    const html = await render({ operation: 'sale', minRooms: '2', sort: 'price' });
    expect(html).toContain('Operación: Venta');
    expect(html).toContain('Habitaciones: 2 o más');
    expect(html).toContain('Quitar todos');
  });

  it('la zona muestra el nombre del municipio ya resuelto, sin consulta nueva', async () => {
    resolveZoneGeometryMock.mockResolvedValue({
      zoneId: 'z-1',
      municipality: 'Getafe',
      state: 'covered',
      centroid: { latitude: 40.3, longitude: -3.7 },
      sweepRadiusM: 4000,
    });
    const html = await render({ zone: '28065' });
    expect(html).toContain('Zona: Getafe');
    expect(html).not.toContain('A 4 km de un punto');
    expect(resolveZoneGeometryMock).toHaveBeenCalledTimes(1);
  });

  it('una zona desconocida cae a «Zona INE xxxxx»', async () => {
    resolveZoneGeometryMock.mockResolvedValue(null);
    const html = await render({ zone: '99999' });
    expect(html).toContain('Zona INE 99999');
  });

  it('recuento completo en la página 1 y parcial con página siguiente o en la página 2', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: true });
    expect(await render({})).toMatch(/0 resultados en esta página/);
    searchPropertiesMock.mockResolvedValue({ results: [], hasNextPage: false });
    expect(await render({ page: '2' })).toMatch(/0 resultados en esta página/);
    // D.6b: el número de página es del paginador, no del recuento.
    expect(await render({ page: '2' })).not.toContain('· página');
    expect(await render({})).not.toContain('en esta página');
  });

  it('los chips y el recuento no aparecen en la rama ?q=', async () => {
    const html = await render({ q: 'piso en venta', operation: 'sale' });
    expect(html).not.toContain('Filtros aplicados');
    expect(html).not.toMatch(/\d+ resultados?/);
  });
});

// D.6b — la página usa el componente `Pagination` y marca la lista como lista
// de filas densas.
describe('lista y paginador en la home (D.6b)', () => {
  const row = {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    operation: 'sale',
    propertyType: 'flat',
    minPriceCents: 100000,
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    address: 'Calle Mayor 1',
    floor: null,
    title: 'Piso',
    description: null,
    thumbnailUrl: null,
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    distinctSourceCount: 1,
    anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002',
  };

  it('con resultados, la lista lleva la clase de filas densas', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [row], hasNextPage: false });
    const html = await render({});
    expect(html).toMatch(/<ul class="result-list">/);
    expect(html).toContain('Piso · Venta');
  });

  it('página 1 sin siguiente: no hay paginador', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [row], hasNextPage: false });
    expect(await render({})).not.toContain('Paginación de resultados');
  });

  it('con página siguiente: «Página 1» y enlace a la 2 con los filtros', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [row], hasNextPage: true });
    const html = await render({ operation: 'sale' });
    expect(html).toContain('Paginación de resultados');
    expect(html).toContain('Página 1');
    expect(html).toContain('href="/?operation=sale&amp;page=2"');
  });

  it('en la página 3 sin siguiente: enlace a la 2 y siguiente sin enlace', async () => {
    searchPropertiesMock.mockResolvedValue({ results: [row], hasNextPage: false });
    const html = await render({ page: '3' });
    expect(html).toContain('Página 3');
    expect(html).toContain('href="/?page=2"');
    expect(html).not.toContain('href="/?page=4"');
  });
});

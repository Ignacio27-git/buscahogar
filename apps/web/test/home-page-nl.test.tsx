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

const { default: HomePage } = await import('../src/app/(search)/page.js');

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
  // D.8a: toda búsqueda válida consulta también el mapa; por defecto, vacío.
  searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
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
    expect(html).toContain('Partes sin reconocer');
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
    expect(html).toContain('Partes sin reconocer');
    expect(html).toContain('terraza');
    expect(html).toContain('Indicaciones contradictorias');
  });

  it('un rango invertido muestra el rechazo nombrado del esquema y deja los campos editables', async () => {
    const html = await render({ q: 'entre 900 y 600 euros' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Precio mínimo (€): no puede ser mayor que el precio máximo');
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
    expect(html).toContain('Precio mínimo (€): escribe un importe');
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
    expect(html).toContain('Precio mínimo (€): no puede ser mayor que el precio máximo.');
    const form = barForm(html);
    expect(findTag(form, 'input', 'name="minPrice"', 'value="900"')).toBeDefined();
    expect(findTag(form, 'input', 'name="maxPrice"', 'value="100"')).toBeDefined();
    expectNoSideEffects();
  });

  it('valores no representables: la alerta nombra el parámetro y la barra se pinta con el valor crudo', async () => {
    const html = await render({ minPrice: 'abc', operation: 'foo' });
    // D.14 (D8, D11): el detalle nombra cada filtro con su rótulo en español, nunca con la clave.
    expect(html).toContain('Operación: elige una de las opciones de la lista.');
    expect(html).toContain('Precio mínimo (€): escribe un importe en euros, con dos decimales como mucho.');
    expect(html).not.toMatch(/operation: |minPrice: |Invalid/);
    const form = barForm(html);
    expect(findTag(form, 'input', 'type="number"', 'name="minPrice"', 'value="abc"')).toBeDefined();
    expect(form).not.toMatch(/<option value="(sale|rent)" selected/);
    expectNoSideEffects();
  });

  it('un oculto rechazado no se reenvía (polígono junto a zona) pero los demás sí', async () => {
    const html = await render({ polygon: POLYGON, zone: '28079', view: 'map' });
    expect(html).toContain('Zona dibujada: no puede combinarse con el municipio; usa solo una forma de indicar la zona.');
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

// D.6b — la bandeja en la home: el recuento solo en la rama válida y la bandeja
// abierta (sin número) en la rama de parámetros inválidos.
describe('bandeja de filtros en la home (D.6b, S15-S17, S21, S22)', () => {
  function summaryOf(html: string): string {
    return /<summary[^>]*>(.*?)<\/summary>/s.exec(html)?.[1] ?? '';
  }

  it('rama válida: cerrada y con el recuento de filtros de la bandeja (sort y zona no cuentan)', async () => {
    resolveZoneGeometryMock.mockResolvedValue(null);
    const html = await render({ operation: 'sale', maxPrice: '300000', sort: 'price', zone: '28079' });
    expect(html).toMatch(/<details class="filter-tray"><summary/);
    expect(summaryOf(html)).toMatch(/>2<span class="sr-only"> activos<\/span>/);
  });

  it('rama válida sin filtros: sin número', async () => {
    expect(summaryOf(await render({}))).not.toMatch(/\d/);
  });

  it('vista de mapa: la misma bandeja con su recuento', async () => {
    searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
    const html = await render({ view: 'map', minRooms: '2' });
    expect(summaryOf(html)).toMatch(/>1<span class="sr-only"> activo<\/span>/);
  });

  it('S17: parámetros inválidos: bandeja abierta y «Filtros» sin número', async () => {
    const html = await render({ minPrice: '900', maxPrice: '100' });
    expect(html).toMatch(/<details class="filter-tray" open="">/);
    expect(summaryOf(html)).toContain('Filtros');
    expect(summaryOf(html)).not.toMatch(/\d/);
  });

  it('S21: la rama ?q= no lleva bandeja ni barra', async () => {
    const html = await render({ q: 'piso en venta', operation: 'sale' });
    expect(html).not.toContain('filter-tray');
    expect(html).not.toContain(BAR);
  });

  it('S22: los chips y el recuento de resultados no cambian con la bandeja', async () => {
    const html = await render({ operation: 'sale', minRooms: '2' });
    expect(html).toContain('Operación: Venta');
    expect(html).toContain('Habitaciones: 2 o más');
    expect(html).toContain('0 resultados');
  });
});

// D.7 (spec nl-search-confirmation R1, home-search-text-entry) — indicador de
// pasos, botón y texto de ayuda de la caja de texto.
const STEPS = 'aria-label="Pasos de la búsqueda"';

function stepsOf(html: string): string {
  const start = html.indexOf(STEPS);
  return start === -1 ? '' : html.slice(start, html.indexOf('</ol>', start));
}

describe('indicador de pasos (D.7, R1)', () => {
  it('S1.1: en la home sin parámetros hay tres pasos y solo el primero es el actual', async () => {
    const steps = stepsOf(await render({}));
    expect(steps.match(/<li/g)).toHaveLength(3);
    expect(steps.match(/aria-current="step"/g)).toHaveLength(1);
    expect(steps).toMatch(/<li[^>]*aria-current="step"[^>]*>[\s\S]*Describe/);
    expect(steps.indexOf('aria-current')).toBeLessThan(steps.indexOf('Revisa'));
  });

  it('S1.2: en una interpretación válida solo el segundo paso es el actual', async () => {
    const steps = stepsOf(await render({ q: 'piso en venta' }));
    expect(steps.match(/aria-current="step"/g)).toHaveLength(1);
    expect(steps.indexOf('aria-current')).toBeGreaterThan(steps.indexOf('Describe'));
    expect(steps.indexOf('aria-current')).toBeLessThan(steps.indexOf('Busca'));
  });

  it('S1.3: con q inválido solo el primer paso es el actual', async () => {
    const steps = stepsOf(await render({ q: 'a'.repeat(201) }));
    expect(steps.match(/aria-current="step"/g)).toHaveLength(1);
    expect(steps.indexOf('aria-current')).toBeLessThan(steps.indexOf('Revisa'));
  });

  it.each([
    ['resultados', { operation: 'sale' }],
    ['mapa', { view: 'map' }],
    ['parámetros inválidos', { minPrice: 'abc' }],
    ['envío del formulario de criterios en blanco', { form: 'criteria', minPrice: '', zone: '' }],
  ] as const)('S1.4/S1.5: %s no lleva indicador de pasos', async (_name, params) => {
    searchMapPointsMock.mockResolvedValue({ points: [], total: 0, truncated: false });
    expect(await render({ ...params })).not.toContain(STEPS);
  });
});

describe('caja de texto: botón y ayuda (D.7, S10.1, S10.2)', () => {
  it.each([
    ['inicio', {}],
    ['resultados', { operation: 'sale' }],
    ['rechazo de parámetros', { minPrice: 'abc' }],
    ['interpretación', { q: 'piso en venta' }],
  ] as const)('%s: botón «Convertir en filtros» y ayuda enlazada por aria-describedby', async (_name, params) => {
    const html = await render({ ...params });
    expect(html).toContain('Convertir en filtros');
    expect(html).not.toContain('Interpretar');
    const input = findTag(html, 'input', 'name="q"');
    expect(input).toContain('aria-describedby="search-text-help"');
    expect(html).toMatch(/<p id="search-text-help"[^>]*>[^<]*Piso en alquiler en Getafe hasta 900 € con 2 habitaciones/);
  });

  it('S10.2: el ejemplo no es un placeholder', async () => {
    expect(await render({})).not.toContain('placeholder');
  });
});

// D.7 (spec nl-search-confirmation R2-R8) — el panel de revisión de la
// interpretación: un único estado, bloque de problemas, resumen de solo lectura,
// campos agrupados y estados de la zona.
function statusOf(html: string): string {
  return /<p role="status"[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? '';
}

function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

const NO_ZONE = 'Sin zona (cualquier municipio)';

describe('panel de revisión: estado y alertas (D.7, R6, R7)', () => {
  it('S6.1: una interpretación sin bloqueos tiene un único estado y ninguna alerta', async () => {
    const html = await render({ q: 'piso con terraza en venta o alquiler' });
    expect(countOf(html, 'role="status"')).toBe(1);
    expect(countOf(html, 'role="alert"')).toBe(0);
    expect(statusOf(html)).toContain('Tu texto se ha convertido en filtros, salvo');
  });

  it('S6.2/S7.1: el rechazo del esquema es la única alerta, con frase previa y el literal de Zod sin repetir', async () => {
    const html = await render({ q: 'entre 900 y 600 euros' });
    expect(countOf(html, 'role="alert"')).toBe(1);
    const lead = html.indexOf('Algún filtro no es válido; corrígelo abajo antes de buscar.');
    const literal = html.indexOf('Precio mínimo (€): no puede ser mayor que el precio máximo');
    expect(lead).toBeGreaterThan(-1);
    expect(literal).toBeGreaterThan(lead);
    expect(countOf(html, 'Precio mínimo (€): no puede ser mayor que el precio máximo')).toBe(1);
    expect(html).not.toContain('No se pudo interpretar la búsqueda');
  });

  it('S6.3: un q inválido sigue avisando del límite de 200 caracteres', async () => {
    const html = await render({ q: 'a'.repeat(201) });
    expect(countOf(html, 'role="alert"')).toBe(1);
    expect(html).toContain('Tu texto tiene más de 200 caracteres.');
    expect(html).not.toContain('role="status"');
  });

  it('S6.4: con el lugar ambiguo el estado menciona la zona pendiente; con zona exacta no', async () => {
    suggestZonesMock.mockResolvedValue([zone('Villanueva', '10001', 'Cáceres'), zone('Villanueva', '20002', 'Gipuzkoa')]);
    expect(statusOf(await render({ q: 'piso en Villanueva' }))).toContain('salvo la zona, que tienes que elegir');
    suggestZonesMock.mockResolvedValue([zone('Getafe', '28065')]);
    expect(statusOf(await render({ q: 'piso en Getafe' }))).not.toContain('zona');
  });

  it('S6.5: solo un lugar ambiguo: el estado pide elegir la zona y ningún municipio queda marcado', async () => {
    suggestZonesMock.mockResolvedValue([zone('Villanueva', '10001', 'Cáceres'), zone('Villanueva', '20002', 'Gipuzkoa')]);
    const html = await render({ q: 'en Villanueva' });
    expect(statusOf(html)).toContain('Todavía no hay ningún filtro: elige la zona abajo.');
    expect(zoneRadio(html, '10001')).not.toContain('checked');
    expect(zoneRadio(html, '20002')).not.toContain('checked');
    expect(zoneRadio(html, '')).toContain('checked');
    expect(html).not.toContain('Prueba a nombrar');
  });
});

describe('panel de revisión: bloque de problemas (D.7, R4)', () => {
  it('S4.1: no entendido y contradicciones van juntos en un único bloque antes del formulario', async () => {
    const html = await render({ q: 'piso con terraza en venta o alquiler' });
    expect(countOf(html, 'class="nl-issues"')).toBe(1);
    const block = html.slice(html.indexOf('class="nl-issues"'), html.indexOf('name="form"'));
    expect(block).toContain('Partes sin reconocer');
    expect(block).toContain('Indicaciones contradictorias');
    expect(block).toContain('terraza');
    expect(html).not.toContain('No he entendido');
  });

  it('S4.2: sin problemas no hay bloque', async () => {
    expect(await render({ q: 'piso en venta' })).not.toContain('nl-issues');
  });
});

describe('panel de revisión: resumen y estado vacío (D.7, R2, R5)', () => {
  it('S2.1: el resumen es de solo lectura, con nombre propio y sin enlaces', async () => {
    const html = await render({ q: 'piso en alquiler hasta 900 €' });
    const start = html.indexOf('aria-label="Filtros interpretados"');
    expect(start).toBeGreaterThan(-1);
    const section = html.slice(start, html.indexOf('</section>', start));
    expect(section).toContain('Operación: Alquiler');
    expect(section).not.toContain('<a');
  });

  it('S2.2: con el esquema rechazado no hay resumen', async () => {
    expect(await render({ q: 'entre 900 y 600 euros' })).not.toContain('Filtros interpretados');
  });

  it('S2.3: nunca «Filtros aplicados» ni un recuento de resultados', async () => {
    const html = await render({ q: 'piso en alquiler hasta 900 €' });
    expect(html).not.toContain('Filtros aplicados');
    expect(html).not.toMatch(/\d+ resultados?/);
  });

  it('S5.1: sin nada reconocido ni lugar hay un estado vacío, sin resumen y con un único estado', async () => {
    const html = await render({ q: 'xyzzy' });
    expect(html).toContain('Prueba a nombrar el tipo de vivienda');
    expect(html).not.toContain('Filtros interpretados');
    expect(countOf(html, 'role="status"')).toBe(1);
    expect(statusOf(html)).toContain('Ninguna parte de tu texto se ha convertido en filtros.');
  });

  it('S5.2: una zona exacta cuenta como reconocida: sin estado vacío y con la zona en el resumen', async () => {
    suggestZonesMock.mockResolvedValue([zone('Getafe', '28065')]);
    const html = await render({ q: 'en Getafe' });
    expect(html).not.toContain('Prueba a nombrar');
    expect(statusOf(html)).toContain('Todo tu texto se ha convertido en filtros.');
    expect(html).toContain('Zona: Getafe');
  });
});

describe('panel de revisión: la zona (D.7, R8)', () => {
  it('S8.1: una coincidencia exacta queda marcada y se explica', async () => {
    suggestZonesMock.mockResolvedValue([zone('Getafe', '28065')]);
    const html = await render({ q: 'piso en Getafe' });
    expect(zoneRadio(html, '28065')).toContain('checked');
    expect(zoneRadio(html, '')).not.toContain('checked');
    expect(html).toContain('Getafe es el único municipio que se llama así');
  });

  it('S8.2: con varios municipios, la leyenda nombra el lugar y la nota dice que son varios', async () => {
    suggestZonesMock.mockResolvedValue([zone('Villanueva', '10001', 'Cáceres'), zone('Villanueva', '20002', 'Gipuzkoa')]);
    const html = await render({ q: 'piso en Villanueva' });
    expect(html).toContain('Elige la zona para «Villanueva»');
    expect(html).toContain('Varios municipios encajan con lo que has escrito.');
    expect(html).toContain(NO_ZONE);
  });

  it('S8.3: un único candidato por prefijo no dice que varios municipios encajen', async () => {
    suggestZonesMock.mockResolvedValue([zone('Madridejos', '45093', 'Toledo')]);
    const html = await render({ q: 'piso en Madrid' });
    expect(html).toContain('Ningún municipio se llama exactamente así; este es el más parecido.');
    expect(html).not.toContain('Varios municipios');
    expect(zoneRadio(html, '45093')).not.toContain('checked');
  });

  it('S8.4: lugar no encontrado y sin lugar tienen avisos distintos y «Sin zona» marcada en ambos', async () => {
    const notFound = await render({ q: 'piso en Atlantis' });
    expect(notFound).toContain('No hay ningún municipio que se llame «Atlantis».');
    expect(notFound).not.toContain('nómbralo en tu texto');
    expect(notFound).toContain(NO_ZONE);
    expect(zoneRadio(notFound, '')).toContain('checked');
    expect(notFound).toContain('en Atlantis');

    const noPlace = await render({ q: 'piso en alquiler' });
    expect(noPlace).toContain('Para buscar en un municipio, nómbralo en tu texto');
    expect(noPlace).not.toContain('No hay ningún municipio');
    expect(noPlace).toContain(NO_ZONE);
    expect(zoneRadio(noPlace, '')).toContain('checked');
  });
});

describe('panel de revisión: estructura (D.7, R3, R9)', () => {
  it('título «Revisa los filtros», aviso de que no se busca todavía y campos agrupados', async () => {
    const html = await render({ q: 'piso en venta' });
    expect(html).toContain('<h2 id="nl-review-heading">Revisa los filtros</h2>');
    expect(html).toContain('La búsqueda no empieza hasta que pulses «Buscar».');
    for (const heading of ['¿Qué buscas?', '¿Cuánto quieres pagar?', '¿De qué tamaño?', '¿Dónde?', 'Orden de los resultados']) {
      expect(html).toContain(`<h3>${heading}</h3>`);
    }
    expect(html).not.toContain('Esto es lo que he entendido');
  });

  // S9.2 («la copia no cambia») queda SUPERSEDED por D8/D11: la copia cambia a tuteo con rótulos.
  it('D8: la rama de parámetros inválidos habla en tuteo, con rótulos y sin el texto antiguo', async () => {
    const html = await render({ minPrice: 'abc' });
    expect(html).toContain('<p id="filters-alert" role="alert">Algún filtro no es válido; corrígelo abajo y vuelve a buscar. Detalle: Precio mínimo (€): escribe un importe en euros, con dos decimales como mucho.</p>');
    expect(html).not.toContain('No se pudo interpretar la búsqueda');
    expect(html).not.toMatch(/\bSe (ha|han|pudo|esperaba)\b/);
  });

  it('N1: un precio que desborda (400 nueves) da el mensaje explícito con su rótulo, sin texto de Zod', async () => {
    const html = await render({ minPrice: '9'.repeat(400) });
    expect(html).toContain('Precio mínimo (€): escribe un importe más pequeño.');
    expect(html).not.toContain('Invalid input');
    expectNoSideEffects();
  });
});

// D.15 (F4, R9, decisión 196) — los campos rechazados llegan marcados a las dos ramas de la página.
describe('campos rechazados: aria-invalid y descripción de la alerta (D.15, F4)', () => {
  it('rama de parámetros inválidos: el campo rechazado apunta a la alerta y el válido no', async () => {
    const html = await render({ minPrice: 'abc', maxPrice: '900' });
    expect(html).toContain('id="filters-alert"');
    const minPrice = findTag(html, 'input', 'name="minPrice"');
    expect(minPrice).toContain('aria-invalid="true"');
    expect(minPrice).toContain('aria-describedby="filters-alert"');
    expect(findTag(html, 'input', 'name="maxPrice"')).not.toContain('aria-invalid');
  });

  it('rama ?q=: un rango invertido marca el campo nombrado y apunta a la alerta del panel', async () => {
    const html = await render({ q: 'entre 900 y 600 euros' });
    expect(html).toContain('id="criteria-alert"');
    const minPrice = findTag(html, 'input', 'name="minPrice"');
    expect(minPrice).toContain('aria-invalid="true"');
    expect(minPrice).toContain('aria-describedby="criteria-alert"');
    expect(findTag(html, 'input', 'name="minRooms"')).not.toContain('aria-invalid');
  });

  it('rama ?q= válida: ningún campo ni la caja de texto se declaran inválidos', async () => {
    const html = await render({ q: 'piso en venta' });
    expect(html).not.toContain('aria-invalid');
  });

  it('rama ?q= con texto rechazado: la caja de texto apunta a su alerta además de a su ayuda', async () => {
    const html = await render({ q: '   ' });
    const input = findTag(html, 'input', 'id="search-text"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="search-text-help search-text-alert"');
    expect(html).toContain('id="search-text-alert"');
  });

  it('la caja de texto de la home no se declara inválida', async () => {
    const html = await render({ minPrice: 'abc' });
    expect(findTag(html, 'input', 'id="search-text"')).not.toContain('aria-invalid');
  });
});

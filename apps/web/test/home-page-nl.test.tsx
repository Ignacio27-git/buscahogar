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

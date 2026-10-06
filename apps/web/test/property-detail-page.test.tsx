// ROADMAP 1.12 (diseño D1/D2/D3; spec, escenarios de 404; arbitraje obs #193
// AR-9/AR-13, spec assumption 4) — invocación directa de la función
// exportada de la página, con `@/server/db` y `@buscahogar/db` sustituidos
// por dobles: evidencia ADICIONAL, no la única ni la bloqueante (la
// bloqueante es el test de esquema Zod, `property-detail-params.schema.test.ts`,
// más esta revisión estática de que la rama de fallo llega a `notFound()`).
// Intento explícito de la spec assumption 4 ("¿se puede invocar la función
// exportada de la página en frío?"): SÍ es viable en Next 16.3.4/React
// 19.2.8 — `notFound()` (`next/navigation`) es una función pura que
// construye y lanza un `Error` con el digest `NEXT_HTTP_ERROR_FALLBACK;404`
// (código fuente de `next`, `dist/client/components/not-found.js`), sin
// depender de ningún contexto de petición real. No es un hallazgo de
// infactibilidad — se documenta igual porque la spec pedía intentarlo.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPropertyDetailHeaderMock = vi.fn();
const getPropertySourcesMock = vi.fn();

vi.mock('@/server/db', () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock('@buscahogar/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@buscahogar/db')>();
  return {
    ...actual,
    getPropertyDetailHeader: getPropertyDetailHeaderMock,
    getPropertySources: getPropertySourcesMock,
  };
});

// `vi.mock` se eleva (hoist) por encima de este import, así que los dobles
// de arriba ya están activos cuando se resuelve.
const { default: PropertyDetailPage } = await import('../src/app/properties/[listingId]/page.js');

// Uuid v4 sintácticamente válido (nibble de versión '4', nibble de
// variante '8'): `z.uuid()` rechaza '1111-1111-1111' por el nibble de
// variante incorrecto — no cualquier cadena con guiones pasa.
const VALID_LISTING_ID = '11111111-1111-4111-8111-111111111111';

describe('PropertyDetailPage — notFound() en los cuatro casos (D2/D3, AR-2)', () => {
  beforeEach(() => {
    getPropertyDetailHeaderMock.mockReset();
    getPropertySourcesMock.mockReset();
  });

  it('uuid malformado: notFound() se lanza SIN consultar la base de datos', async () => {
    await expect(
      PropertyDetailPage({ params: Promise.resolve({ listingId: 'not-a-uuid' }) })
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);

    expect(getPropertyDetailHeaderMock).not.toHaveBeenCalled();
  });

  it('uuid bien formado pero sin fila property_listings: notFound()', async () => {
    getPropertyDetailHeaderMock.mockResolvedValueOnce(undefined);

    await expect(
      PropertyDetailPage({ params: Promise.resolve({ listingId: VALID_LISTING_ID }) })
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);

    expect(getPropertySourcesMock).not.toHaveBeenCalled();
  });

  it('cabecera encontrada: renderiza sin lanzar notFound()', async () => {
    getPropertyDetailHeaderMock.mockResolvedValueOnce({
      id: 'property-1',
      minPriceCents: 100000,
      listingCount: 1,
      thumbnailUrl: null,
      propertyType: 'flat',
      operation: 'sale',
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      floor: '3',
      title: 'Piso',
      description: null,
      address: null,
    });
    getPropertySourcesMock.mockResolvedValueOnce([]);

    const element = await PropertyDetailPage({ params: Promise.resolve({ listingId: VALID_LISTING_ID }) });

    expect(element).toBeTruthy();
    expect(getPropertySourcesMock).toHaveBeenCalledWith(expect.anything(), 'property-1');
  });
});

// D.9 (decisión 171) — enlace de vuelta a los resultados, revalidado en la ficha.
describe('PropertyDetailPage — enlace de vuelta (D.9)', () => {
  const HEADER = {
    id: 'property-1',
    minPriceCents: 100000,
    listingCount: 1,
    thumbnailUrl: null,
    propertyType: 'flat',
    operation: 'sale',
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    floor: '3',
    title: 'Piso',
    description: null,
    address: null,
  };

  async function renderWith(searchParams?: Record<string, string | string[]>): Promise<string> {
    getPropertyDetailHeaderMock.mockReset();
    getPropertySourcesMock.mockReset();
    getPropertyDetailHeaderMock.mockResolvedValueOnce(HEADER);
    getPropertySourcesMock.mockResolvedValueOnce([]);
    const element = await PropertyDetailPage({
      params: Promise.resolve({ listingId: VALID_LISTING_ID }),
      ...(searchParams !== undefined ? { searchParams: Promise.resolve(searchParams) } : {}),
    });
    return renderToStaticMarkup(element);
  }

  it('búsqueda válida: «Volver a los resultados» apunta a /? con esas claves', async () => {
    const html = await renderWith({ operation: 'sale', minPrice: '100000', sort: 'price', dir: 'asc', view: 'map' });

    expect(html).toContain(
      '<p class="property-detail__back"><a href="/?operation=sale&amp;minPrice=100000&amp;sort=price&amp;dir=asc&amp;view=map">Volver a los resultados</a></p>'
    );
  });

  it('sin parámetros: «Volver a la búsqueda» apunta a /', async () => {
    const html = await renderWith();

    expect(html).toContain('<p class="property-detail__back"><a href="/">Volver a la búsqueda</a></p>');
  });

  it('un valor inválido cae a / sin rescatar el válido', async () => {
    const html = await renderWith({ sort: '<script>', minPrice: '100000' });

    expect(html).toContain('<a href="/">Volver a la búsqueda</a>');
    expect(html).not.toContain('minPrice=100000');
  });
});

// D.9 (decisión 173) — el orden del DOM es el visual en cualquier ancho.
describe('PropertyDetailPage — composición y orden del DOM (D.9)', () => {
  const HEADER = {
    id: 'property-1',
    minPriceCents: 15000000,
    listingCount: 1,
    thumbnailUrl: null,
    propertyType: 'flat',
    operation: 'sale',
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    floor: '3',
    title: 'Piso luminoso',
    description: 'Un párrafo.',
    address: 'Calle Mayor 1',
  };
  const SOURCE = {
    listingId: 'l1',
    sourceKey: 'idealista',
    url: 'https://www.idealista.com/inmueble/1',
    priceCents: 15000000,
    thumbnailUrl: 'https://img4.idealista.com/1.jpg',
    numPhotos: 10,
    status: 'active',
    lastSeenAt: new Date('2026-09-10T00:00:00Z'),
    propertyType: 'flat',
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    floor: '3',
    address: 'Calle Mayor 1',
  };

  async function renderFicha(header: Record<string, unknown>): Promise<string> {
    getPropertyDetailHeaderMock.mockReset();
    getPropertySourcesMock.mockReset();
    getPropertyDetailHeaderMock.mockResolvedValueOnce(header);
    getPropertySourcesMock.mockResolvedValueOnce([SOURCE]);
    const element = await PropertyDetailPage({ params: Promise.resolve({ listingId: VALID_LISTING_ID }) });
    return renderToStaticMarkup(element);
  }

  it('orden: enlace de vuelta, título, precio de cabecera, galería, panel y descripción', async () => {
    const html = await renderFicha(HEADER);
    const positions = [
      html.indexOf('property-detail__back'),
      html.indexOf('<h1'),
      html.indexOf('property-summary--lead'),
      html.indexOf('aria-roledescription="carrusel"'),
      html.indexOf('property-detail__panel'),
      html.indexOf('property-summary--panel'),
      html.indexOf('class="source-list"'),
      html.indexOf('class="property-description"'),
    ];

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('hay un único <h1> con el título y las dos copias del resumen por su gancho', async () => {
    const html = await renderFicha(HEADER);

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('>Piso luminoso</h1>');
    expect(html).toContain('property-summary property-summary--lead');
    expect(html).toContain('property-summary property-summary--panel');
  });

  it('título nulo: el <h1> dice «Ficha de la vivienda»', async () => {
    const html = await renderFicha({ ...HEADER, title: null });

    expect(html).toContain('>Ficha de la vivienda</h1>');
  });

  it('el panel envuelve la cabecera y las fuentes, y la descripción queda fuera', async () => {
    const html = await renderFicha(HEADER);
    const panelStart = html.indexOf('property-detail__panel');
    const description = html.indexOf('class="property-description"');

    expect(html.indexOf('class="source-list"')).toBeGreaterThan(panelStart);
    expect(html.indexOf('class="source-list"')).toBeLessThan(description);
    expect(html).toContain('class="property-detail"');
  });
});

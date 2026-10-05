// Paso D.5 (spec page-metadata R2-R4, diseño decisión 148) — `generateMetadata` de la
// ficha y la página comparten UN cargador con `cache()` de React, de modo que una
// petición consulta la cabecera una sola vez. `cache` solo memoiza dentro de una
// petición real de React; aquí se sustituye por un memoizador sobre un `Map` y se
// reinician los módulos en cada prueba para que cada una parta de un caché vacío.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPropertyDetailHeaderMock = vi.fn();
const getPropertySourcesMock = vi.fn();

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <Args extends readonly unknown[], Result>(
      fn: (...args: Args) => Result
    ): ((...args: Args) => Result) => {
      const memo = new Map<string, Result>();
      return (...args: Args): Result => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key) as Result;
      };
    },
  };
});

vi.mock('@/server/db', () => ({ getDb: vi.fn(() => ({})) }));

vi.mock('@buscahogar/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@buscahogar/db')>();
  return {
    ...actual,
    getPropertyDetailHeader: getPropertyDetailHeaderMock,
    getPropertySources: getPropertySourcesMock,
  };
});

const PAGE_PATH = fileURLToPath(new URL('../src/app/properties/[listingId]/page.tsx', import.meta.url));
const VALID_LISTING_ID = '11111111-1111-4111-8111-111111111111';
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/;

type DetailPageModule = typeof import('../src/app/properties/[listingId]/page.js');

async function loadPage(): Promise<DetailPageModule> {
  vi.resetModules();
  return import('../src/app/properties/[listingId]/page.js');
}

function headerWithTitle(title: string | null): Record<string, unknown> {
  return {
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
    title,
    description: null,
    address: null,
  };
}

const params = (listingId: string): { params: Promise<{ listingId: string }> } => ({
  params: Promise.resolve({ listingId }),
});

beforeEach(() => {
  getPropertyDetailHeaderMock.mockReset();
  getPropertySourcesMock.mockReset();
  getPropertySourcesMock.mockResolvedValue([]);
});

describe('una sola consulta de cabecera por petición (R4, S4.1)', () => {
  it('generateMetadata y la página para el mismo id consultan la cabecera una vez', async () => {
    getPropertyDetailHeaderMock.mockResolvedValue(headerWithTitle('Piso en Triana'));
    const page = await loadPage();

    await page.generateMetadata(params(VALID_LISTING_ID));
    await page.default(params(VALID_LISTING_ID));

    expect(getPropertyDetailHeaderMock).toHaveBeenCalledTimes(1);
    expect(getPropertyDetailHeaderMock).toHaveBeenCalledWith(expect.anything(), VALID_LISTING_ID);
  });

  it('el cargador no se comparte entre ids distintos', async () => {
    getPropertyDetailHeaderMock.mockResolvedValue(headerWithTitle('Piso'));
    const page = await loadPage();

    await page.generateMetadata(params(VALID_LISTING_ID));
    await page.generateMetadata(params('22222222-2222-4222-8222-222222222222'));

    expect(getPropertyDetailHeaderMock).toHaveBeenCalledTimes(2);
  });
});

describe('título de la ficha (R2)', () => {
  it.each([
    ['título normal', 'Piso en Triana', 'Piso en Triana'],
    ['título con espacios alrededor', '  Piso en Triana  ', 'Piso en Triana'],
    ['título nulo', null, 'Ficha de la vivienda'],
    ['título vacío', '', 'Ficha de la vivienda'],
    ['título solo con espacios', '   ', 'Ficha de la vivienda'],
  ] as const)('%s', async (_name, rawTitle, expected) => {
    getPropertyDetailHeaderMock.mockResolvedValue(headerWithTitle(rawTitle));
    const page = await loadPage();

    const metadata = await page.generateMetadata(params(VALID_LISTING_ID));

    expect(metadata).toEqual({ title: expected });
    expect(JSON.stringify(metadata)).not.toContain('No consolidado');
  });
});

describe('ficha inexistente (R3)', () => {
  it('uuid malformado: 404 sin consultar la base de datos', async () => {
    const page = await loadPage();

    await expect(page.generateMetadata(params('not-a-uuid'))).rejects.toThrow(NOT_FOUND);

    expect(getPropertyDetailHeaderMock).not.toHaveBeenCalled();
  });

  it('cabecera ausente: 404 también en los metadatos', async () => {
    getPropertyDetailHeaderMock.mockResolvedValue(undefined);
    const page = await loadPage();

    await expect(page.generateMetadata(params(VALID_LISTING_ID))).rejects.toThrow(NOT_FOUND);
  });
});

describe('código fuente de la ficha (R3, R4)', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');

  it('importa cache de react y llama a getPropertyDetailHeader una sola vez', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bcache\b[^}]*\}\s*from\s*'react'/);
    expect(source.match(/getPropertyDetailHeader\(/g)).toHaveLength(1);
  });

  it('conserva los dos bloques notFound() literales en generateMetadata y en la página', () => {
    expect(source.match(/if \(!parsed\.success\) \{\s*notFound\(\);\s*\}/g)).toHaveLength(2);
    expect(source.match(/if \(header === undefined\) \{\s*notFound\(\);\s*\}/g)).toHaveLength(2);
  });
});

// D.14 (decisión 187, enmienda la 148) — la cabecera de la ficha la consultan el layout
// (existencia), la página y `generateMetadata`. Un `cache()` de React compartido y exportado
// desde `src/server/property-header.ts` hace que sean UNA consulta por petición. `cache` solo
// memoiza dentro de una petición real; aquí se sustituye por un memoizador sobre un `Map`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPropertyDetailHeaderMock = vi.fn();

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
  return { ...actual, getPropertyDetailHeader: getPropertyDetailHeaderMock };
});

const SERVER_PATH = fileURLToPath(new URL('../src/server/property-header.ts', import.meta.url));
const VALID_LISTING_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_LISTING_ID = '22222222-2222-4222-8222-222222222222';

describe('loadPropertyHeader — cargador compartido con cache (decisión 187)', () => {
  beforeEach(() => {
    getPropertyDetailHeaderMock.mockReset();
    vi.resetModules();
  });

  it('dos llamadas con el mismo id consultan la base de datos una sola vez', async () => {
    getPropertyDetailHeaderMock.mockResolvedValue({ id: 'property-1' });
    const { loadPropertyHeader } = await import('../src/server/property-header.js');

    const first = await loadPropertyHeader(VALID_LISTING_ID);
    const second = await loadPropertyHeader(VALID_LISTING_ID);

    expect(first).toEqual({ id: 'property-1' });
    expect(second).toBe(first);
    expect(getPropertyDetailHeaderMock).toHaveBeenCalledTimes(1);
    expect(getPropertyDetailHeaderMock).toHaveBeenCalledWith({}, VALID_LISTING_ID);
  });

  it('ids distintos consultan por separado y devuelven undefined cuando no existe', async () => {
    getPropertyDetailHeaderMock.mockResolvedValue(undefined);
    const { loadPropertyHeader } = await import('../src/server/property-header.js');

    await expect(loadPropertyHeader(VALID_LISTING_ID)).resolves.toBeUndefined();
    await expect(loadPropertyHeader(OTHER_LISTING_ID)).resolves.toBeUndefined();

    expect(getPropertyDetailHeaderMock).toHaveBeenCalledTimes(2);
  });

  it('el módulo importa server-only (maneja el handle de DB)', () => {
    const source = readFileSync(SERVER_PATH, 'utf8');
    expect(source).toMatch(/^\s*import\s+['"]server-only['"]/m);
  });
});

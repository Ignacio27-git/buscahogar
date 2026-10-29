// D.14 (decisión 187) — el layout de la ficha comprueba la existencia ANTES de cualquier
// frontera de streaming, de modo que una ficha inexistente o malformada responde 404 y no 200.
// Invocación directa de la función exportada, con el cargador compartido sustituido por un doble.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPropertyHeaderMock = vi.fn();

vi.mock('@/server/property-header', () => ({ loadPropertyHeader: loadPropertyHeaderMock }));

const { default: PropertyLayout } = await import('../src/app/properties/[listingId]/layout.js');

const VALID_LISTING_ID = '11111111-1111-4111-8111-111111111111';
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/;
const APP_DIR = fileURLToPath(new URL('../src/app/', import.meta.url));
const FICHA_DIR = `${APP_DIR}properties/[listingId]/`;

describe('layout de la ficha — notFound() antes del streaming (decisión 187)', () => {
  beforeEach(() => {
    loadPropertyHeaderMock.mockReset();
  });

  it('id malformado: notFound() sin consultar la base de datos', async () => {
    await expect(
      PropertyLayout({ children: 'contenido', params: Promise.resolve({ listingId: 'not-a-uuid' }) })
    ).rejects.toThrow(NOT_FOUND);

    expect(loadPropertyHeaderMock).not.toHaveBeenCalled();
  });

  it('id oversized (no uuid): también 404 sin consultar', async () => {
    await expect(
      PropertyLayout({ children: 'contenido', params: Promise.resolve({ listingId: 'x'.repeat(500) }) })
    ).rejects.toThrow(NOT_FOUND);

    expect(loadPropertyHeaderMock).not.toHaveBeenCalled();
  });

  it('id bien formado sin cabecera: notFound() tras una sola consulta', async () => {
    loadPropertyHeaderMock.mockResolvedValue(undefined);

    await expect(
      PropertyLayout({ children: 'contenido', params: Promise.resolve({ listingId: VALID_LISTING_ID }) })
    ).rejects.toThrow(NOT_FOUND);

    expect(loadPropertyHeaderMock).toHaveBeenCalledTimes(1);
    expect(loadPropertyHeaderMock).toHaveBeenCalledWith(VALID_LISTING_ID);
  });

  it('cabecera existente: devuelve los hijos sin envolverlos', async () => {
    loadPropertyHeaderMock.mockResolvedValue({ id: 'property-1' });

    const result = await PropertyLayout({
      children: 'contenido',
      params: Promise.resolve({ listingId: VALID_LISTING_ID }),
    });

    if (!isValidElement<{ children: unknown }>(result)) {
      throw new Error('el layout debe devolver un elemento React');
    }
    expect(result.props.children).toBe('contenido');
  });
});

describe('estructura de la ficha (static)', () => {
  it('no hay not-found.tsx bajo properties/[listingId]/: sirve el raíz', () => {
    expect(existsSync(FICHA_DIR)).toBe(true);
    expect(readdirSync(FICHA_DIR)).toContain('layout.tsx');
    expect(existsSync(`${FICHA_DIR}not-found.tsx`)).toBe(false);
  });

  it('el layout y la página comparten el cargador y ninguno crea otro cache()', () => {
    for (const file of ['layout.tsx', 'page.tsx']) {
      const source = readFileSync(`${FICHA_DIR}${file}`, 'utf8');
      expect(source).toMatch(/from\s+'@\/server\/property-header'/);
      expect(source).not.toMatch(/\bcache\(/);
    }
  });
});

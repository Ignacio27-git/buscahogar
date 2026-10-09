// D.14 (decisiones 186-189; spec global-states) — estados globales extremo a extremo:
// el estado HTTP real de los 404 (el layout de la ficha llama a `notFound()` antes de
// transmitir, así que la respuesta es 404 y no un 200 con el cuerpo cambiado) y la página 429
// que construye el proxy, con contraste AA en ambos esquemas. Un solo proyecto: nada depende del
// ancho ni del esquema del proyecto (cada prueba fija el suyo).
import { E2E_DETAIL_LISTING_ID, E2E_MISSING_LISTING_ID } from '@buscahogar/db/e2e';
import type { Page } from '@playwright/test';

import { buildRateLimitResponse } from '../src/server/rate-limit-page';

import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';
const AA_TEXT_RATIO = 4.5;
const RETRY_AFTER_SECONDS = 42;
const NOT_FOUND_TITLE = 'No encontramos esta página';

test.describe('estados globales (D.14)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('una URL que no casa con ninguna ruta responde 404 con la salida a la búsqueda', async ({
    page,
  }) => {
    const response = await page.goto('/no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOT_FOUND_TITLE);
    await expect(page.getByRole('link', { name: 'Ir a la búsqueda' })).toHaveAttribute('href', '/');
  });

  test('una ficha que no existe responde 404 con la misma página raíz', async ({ page }) => {
    const response = await page.goto(`/properties/${E2E_MISSING_LISTING_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOT_FOUND_TITLE);
    await expect(page.getByRole('link', { name: 'Ir a la búsqueda' })).toHaveAttribute('href', '/');
  });

  test('un identificador de ficha malformado responde 404', async ({ page }) => {
    const response = await page.goto('/properties/not-a-uuid');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOT_FOUND_TITLE);
  });

  test('una ficha que existe sigue respondiendo 200', async ({ page }) => {
    const response = await page.goto(`/properties/${E2E_DETAIL_LISTING_ID}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(NOT_FOUND_TITLE);
  });

  test('la salida del 404 lleva a la búsqueda', async ({ page }) => {
    await page.goto('/no-existe');
    await page.getByRole('link', { name: 'Ir a la búsqueda' }).click();
    await expect(page).toHaveURL('/');
  });
});

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// El navegador devuelve `oklch(...)` tal cual en los estilos calculados; un canvas 1x1 lo
// convierte a sRGB sin reimplementar la conversión de color.
async function resolvedColors(page: Page, selector: string): Promise<{ fg: Rgb; bg: Rgb }> {
  return page.evaluate((sel) => {
    const toRgb = (css: string): { r: number; g: number; b: number } => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas sin contexto 2d');
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const element = document.querySelector(sel);
    if (element === null) throw new Error(`no existe ${sel}`);
    return {
      fg: toRgb(getComputedStyle(element).color),
      bg: toRgb(getComputedStyle(document.body).backgroundColor),
    };
  }, selector);
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// La página 429 y `global-error.tsx` comparten `STANDALONE_PAGE_CSS` (decisión 186), así que
// añadir un enlace al cuerpo de la 429 comprueba también el color de enlace de ambas.
function pageWithLink(): string {
  const { body } = buildRateLimitResponse(RETRY_AFTER_SECONDS);
  return body.replace('</main>', '<p><a href="/">Ir a la búsqueda</a></p></main>');
}

test.describe('página 429 y CSS autónomo: contraste AA (D.14)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`el título, el párrafo y el enlace cumplen AA en ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(pageWithLink());
      for (const selector of ['.standalone h1', '.standalone p', '.standalone a']) {
        const { fg, bg } = await resolvedColors(page, selector);
        expect(contrast(fg, bg), `${selector} en ${scheme}`).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
      }
    });
  }

  test('el fondo oscuro es más oscuro que el claro', async ({ page }) => {
    const measured: Record<'light' | 'dark', number> = { light: 0, dark: 0 };
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(pageWithLink());
      const { bg } = await resolvedColors(page, '.standalone h1');
      measured[scheme] = luminance(bg);
    }
    expect(measured.light).toBeGreaterThan(0.5);
    expect(measured.dark).toBeLessThan(measured.light);
  });
});

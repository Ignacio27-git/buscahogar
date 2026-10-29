// Paso D.19 (decisión 230; sustituye a la comprobación de D.18, decisión 217) — la app se pinta con
// Figtree, autoalojada y variable (300-900). Liberation Sans, que la imagen e2e fija con fontconfig para
// `sans-serif` y `system-ui` (decisión 217), queda solo como respaldo y para las páginas independientes,
// que conservan la pila del sistema (decisión 233). Se pregunta a Chromium qué fuente de plataforma pintó
// de verdad (CDP `CSS.getPlatformFontsForNode`), no se deduce del CSS. Se ejecuta en UN solo proyecto:
// la fuente no depende del ancho ni del esquema.
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';
const MARKER = 'data-e2e-font-probe';
const GLOBAL_ERROR_PATH = '/e2e-only/global-error';

interface PlatformFont {
  familyName: string;
  postScriptName?: string;
  isCustomFont: boolean;
  glyphCount: number;
}

// Marca el elemento y devuelve las fuentes de plataforma con las que Chromium lo pintó.
async function platformFonts(page: Page, selector: string): Promise<PlatformFont[]> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    expect(nodeId, `no existe ${selector}`).toBeGreaterThan(0);
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts;
  } finally {
    await session.detach();
  }
}

// Marca el primer elemento visible con texto propio (CDP solo devuelve fuentes del texto DIRECTO del
// nodo) que cumpla el filtro, y dice si lo encontró.
async function markFirst(page: Page, selector: string, weight: string | null): Promise<boolean> {
  return page.evaluate(
    ({ selector: query, weight: wanted, marker }) => {
      const target = Array.from(document.querySelectorAll(query)).find((element) => {
        const ownText = Array.from(element.childNodes).some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== ''
        );
        const weightMatches = wanted === null || getComputedStyle(element).fontWeight === wanted;
        // Debe estar pintado: un nodo oculto no tiene caja de texto y CDP no devuelve fuentes.
        return ownText && weightMatches && element.checkVisibility();
      });
      target?.setAttribute(marker, '');
      return target !== undefined;
    },
    { selector, weight, marker: MARKER }
  );
}

test.describe('fuentes de la app (Figtree)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('el cuerpo se pinta con Figtree, una fuente propia, y la familia empieza por Figtree', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await markFirst(page, 'main p, main li', null)).toBe(true);

    const fonts = await platformFonts(page, `[${MARKER}]`);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.familyName).toMatch(/figtree/i);
      expect(font.isCustomFont).toBe(true);
    }
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/^"?figtree/i);
  });

  test('un texto de peso 600 usa la cara variable de Figtree, no una Bold de respaldo', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await markFirst(page, 'h1, h2, h3, h4, strong, summary', '600')).toBe(true);

    const fonts = await platformFonts(page, `[${MARKER}]`);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.familyName).toMatch(/figtree/i);
      expect(font.familyName).not.toBe('Liberation Sans');
      expect(font.isCustomFont).toBe(true);
    }

    // La cara cargada cubre 300-900: el 600 es real (eje de peso), no una negrita sintetizada.
    const faces = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => /figtree/i.test(face.family) && !/fallback/i.test(face.family))
        .map((face) => ({ weight: face.weight, status: face.status }))
    );
    expect(faces).toEqual([{ weight: '300 900', status: 'loaded' }]);
  });

  test('las cifras tabulares anulan el ancho proporcional de Figtree', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const widths = await page.evaluate(() => {
      const measure = (text: string, tabular: boolean): number => {
        const probe = document.createElement('span');
        probe.textContent = text;
        probe.style.display = 'inline-block';
        probe.style.whiteSpace = 'pre';
        probe.style.fontVariantNumeric = tabular ? 'tabular-nums' : 'normal';
        document.querySelector('main')?.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      return {
        tabularOnes: measure('1111', true),
        tabularZeros: measure('0000', true),
        proportionalOnes: measure('1111', false),
        proportionalZeros: measure('0000', false),
      };
    });
    expect(widths.tabularOnes).toBeCloseTo(widths.tabularZeros, 1);
    expect(widths.proportionalOnes).not.toBeCloseTo(widths.proportionalZeros, 1);
  });

  test('toda petición de fuente va al mismo origen y hay al menos una', async ({ page, baseURL }) => {
    const fontRequests: Request[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(request);
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const origin = new URL(baseURL ?? 'http://127.0.0.1:3100').origin;
    expect(fontRequests.length, 'se pidió el woff2 de Figtree').toBeGreaterThan(0);
    for (const request of fontRequests) {
      expect(new URL(request.url()).origin).toBe(origin);
    }
  });
});

test.describe('páginas independientes (pila del sistema)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('global-error se pinta con Liberation Sans y no con Figtree', async ({ page }) => {
    await page.goto(GLOBAL_ERROR_PATH);
    expect(await markFirst(page, '.standalone p, .standalone h1', null)).toBe(true);

    const fonts = await platformFonts(page, `[${MARKER}]`);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.familyName).toBe('Liberation Sans');
      expect(font.isCustomFont).toBe(false);
    }
  });
});

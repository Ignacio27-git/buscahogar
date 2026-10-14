// Paso D.18 (decisión 217) — la imagen e2e renderiza la pila sans con Liberation Sans, y el texto
// de peso 600 con su cara Bold (la familia no tiene SemiBold: sale 700, sin sintetizar). Se pregunta
// a Chromium qué fuente de plataforma pintó de verdad (CDP `CSS.getPlatformFontsForNode`), no se
// deduce del CSS. Se ejecuta en UN solo proyecto: la fuente no depende del ancho ni del esquema.
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';
const MARKER = 'data-e2e-font-probe';

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

test.describe('fuentes de la imagen e2e', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('el cuerpo se pinta con Liberation Sans', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((marker) => {
      // Un párrafo del cuerpo con texto propio (CDP solo mide el texto directo del nodo).
      const target = Array.from(document.querySelectorAll('main p, main li')).find((element) =>
        Array.from(element.childNodes).some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== ''
        )
      );
      target?.setAttribute(marker, '');
    }, MARKER);

    const fonts = await platformFonts(page, `[${MARKER}]`);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font.familyName).toBe('Liberation Sans');
  });

  test('un texto de peso 600 se pinta con la cara Bold de Liberation Sans', async ({ page }) => {
    await page.goto('/');
    const found = await page.evaluate((marker) => {
      const candidates = Array.from(document.querySelectorAll('h1, h2, h3, h4, strong, summary'));
      const semibold = candidates.find((element) => {
        const style = getComputedStyle(element);
        // CDP solo devuelve fuentes para el texto PROPIO del nodo: hace falta un nodo de texto hijo.
        const ownText = Array.from(element.childNodes).some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== ''
        );
        // Debe estar pintado: un nodo oculto no tiene caja de texto y CDP no devuelve fuentes.
        return style.fontWeight === '600' && ownText && element.checkVisibility();
      });
      semibold?.setAttribute(marker, '');
      return semibold !== undefined;
    }, MARKER);
    expect(found, 'la home debe tener algún texto de peso 600').toBe(true);

    const fonts = await platformFonts(page, `[${MARKER}]`);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.familyName).toBe('Liberation Sans');
      expect(font.postScriptName).toBe('LiberationSans-Bold');
    }
  });
});

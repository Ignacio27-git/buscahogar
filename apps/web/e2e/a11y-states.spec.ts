// Paso D.15 (R2, R3, R10; decisiones 197 y 201) — estados dinámicos de accesibilidad. Sin capturas ni
// línea base: aquí un fallo es un fallo. Este fichero nace con la comprobación de WCAG 1.4.12 (F5, T6.3);
// el resto de estados (axe en bandeja abierta, alertas, 429, error...) se añade en la unidad siguiente.
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

function onlyProject(name: string): void {
  test.skip(test.info().project.name !== name, `solo ${name}`);
}

// WCAG 1.4.12 (espaciado del texto): las cuatro sustituciones mínimas que una persona puede aplicar sin
// que el contenido pierda información ni funcionalidad. Con `!important` para ganar a la hoja propia.
const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

// Una etiqueta no recorta su texto si su contenido cabe en su caja en los dos ejes.
async function clippedLabels(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight
      )
      .map((element) => element.textContent.trim())
  );
}

test.describe('espaciado del texto sin recorte (WCAG 1.4.12, F5)', () => {
  test('las etiquetas de precio del mapa caben en su caja a 1280 px', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    // Sin etiquetas, el `[]` de abajo no probaría nada.
    expect(await page.locator('.map-price').count()).toBeGreaterThan(0);
    expect(await clippedLabels(page, '.map-price')).toEqual([]);
  });

  test('las direcciones de la lista caben en su caja a 320 px', async ({ page }) => {
    onlyProject('w320-light');
    await openRoute(page, route('home'));
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    expect(await page.locator('.result-row__address').count()).toBeGreaterThan(0);
    expect(await clippedLabels(page, '.result-row__address')).toEqual([]);
  });
});

// Paso D.19 (decisión 230; spec «Layout survives the wider face») — Figtree es más ancha que la pila
// del sistema, y tres cajas tienen un ancho fijo: la etiqueta de precio del mapa (96 px), la columna
// del precio de la fila de resultado (10rem) y el rótulo del eje del gráfico del histórico (70, en
// `X_LABEL_WIDTH`). Primero se MIDE y solo se tocan las constantes si una medida falla (diseño:
// «measure-then-adjust»). El precio más largo realista es «1.234.567 €».
//
// Se ejecuta en los dos anchos extremos (320 y 1280 px, tema claro): la fuente no depende del esquema.
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const LONGEST_PRICE = '1.234.567 €';
const WIDTHS = ['w320-light', 'w1280-light'];

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

test.describe('cajas de ancho fijo con Figtree', () => {
  test.beforeEach(() => {
    test.skip(!WIDTHS.includes(test.info().project.name), 'solo 320 y 1280 px');
  });

  test('las etiquetas de precio del mapa caben en su caja, también con el precio más largo', async ({
    page,
  }) => {
    await openRoute(page, route('map'));
    const labels = page.locator('.map-price');
    // Sin etiquetas, los `[]` de abajo no probarían nada.
    expect(await labels.count()).toBeGreaterThan(0);

    const clipped = await labels.evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => element.textContent.trim())
    );
    expect(clipped, 'etiquetas reales recortadas').toEqual([]);

    const longest = await labels.first().evaluate((element, price) => {
      element.textContent = price;
      return { scroll: element.scrollWidth, client: element.clientWidth };
    }, LONGEST_PRICE);
    expect(longest.scroll, `«${LONGEST_PRICE}» en la etiqueta`).toBeLessThanOrEqual(longest.client);
  });

  test('el precio de la fila de resultado cabe en su columna, también con el precio más largo', async ({
    page,
  }) => {
    await openRoute(page, route('home'));
    const prices = page.locator('.result-row__price');
    expect(await prices.count()).toBeGreaterThan(0);

    const overflowing = await prices.evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => element.textContent.trim())
    );
    expect(overflowing, 'precios reales desbordados').toEqual([]);

    const longest = await prices.first().evaluate((element, price) => {
      const text = element.firstChild;
      if (text !== null) text.textContent = price;
      return {
        scroll: element.scrollWidth,
        client: element.clientWidth,
        page: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      };
    }, LONGEST_PRICE);
    expect(longest.scroll, `«${LONGEST_PRICE}» en la columna`).toBeLessThanOrEqual(longest.client);
    expect(longest.page, 'la página no desborda en horizontal').toBeLessThanOrEqual(longest.viewport);
  });

  test('los rótulos del gráfico caben: fechas en 70 y el precio más largo dentro del lienzo', async ({
    page,
  }) => {
    await openRoute(page, route('detail-history'));
    const labels = page.locator('.price-chart__label');
    expect(await labels.count()).toBeGreaterThan(0);

    const measured = await labels.evaluateAll((elements) =>
      elements
        .filter((element) => (element as SVGTextElement).checkVisibility())
        .map((element) => {
          const text = element as SVGTextElement;
          return {
            text: text.textContent,
            isPrice: text.getAttribute('text-anchor') === 'end' && text.textContent.includes('€'),
            width: text.getBBox().width,
          };
        })
    );
    const dates = measured.filter((label) => !label.isPrice);
    expect(dates.length, 'rótulos de fecha visibles').toBeGreaterThan(0);
    for (const label of dates) {
      expect(label.width, `fecha «${label.text}»`).toBeLessThanOrEqual(70);
    }

    const price = await page.evaluate((longest) => {
      const candidates = [...document.querySelectorAll<SVGTextElement>('.price-chart__label')];
      const target = candidates.find(
        (element) =>
          element.checkVisibility() &&
          element.getAttribute('text-anchor') === 'end' &&
          element.textContent.includes('€')
      );
      if (target === undefined) return null;
      target.textContent = longest;
      return target.getBBox().x;
    }, LONGEST_PRICE);
    expect(price, 'hay un rótulo de precio visible').not.toBeNull();
    expect(price, `«${LONGEST_PRICE}» no se sale por la izquierda del lienzo`).toBeGreaterThanOrEqual(0);
  });
});

// Paso D.20 (spec result-row-presentation R2.1/S2.5; diseño «Row-height delta») — la fila de
// resultado debe seguir siendo fina. Las alturas de abajo se midieron en Docker (Chromium + Liberation
// Sans) sobre el código SIN cambiar de D.20, antes de tocar ningún CSS. La siembra no tiene filas con
// foto: las cinco son «Sin foto»; la primera es la de varias fuentes (insignia `--multi`) y el resto
// tiene una sola fuente. El margen de +4 px es el del spec (R2.1).
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const ROW_HEIGHT_TOLERANCE = 4;

// Alturas por fila, en el orden de la lista. La tema no cambia la medida, pero se fija por proyecto
// para que un desvío en oscuro también se vea.
const BASELINE_ROW_HEIGHT: Readonly<Record<string, readonly number[]>> = {
  'w320-light': [141, 139, 139, 139, 159],
  'w320-dark': [141, 139, 139, 139, 159],
  'w768-light': [145, 145, 145, 145, 145],
  'w768-dark': [145, 145, 145, 145, 145],
  'w1280-light': [145, 145, 145, 145, 145],
  'w1280-dark': [145, 145, 145, 145, 145],
};

test.describe('D.20 altura de la fila de resultado', () => {
  test('ninguna fila crece más de 4 px sobre la altura previa a D.20', async ({ page }, testInfo) => {
    const home = ROUTES.find((candidate) => candidate.name === 'home');
    if (home === undefined) throw new Error('falta la ruta home');
    const pinned = BASELINE_ROW_HEIGHT[testInfo.project.name];
    if (pinned === undefined) throw new Error(`sin alturas fijadas para ${testInfo.project.name}`);

    await openRoute(page, home);
    const heights = await page
      .locator('.result-list > li')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));

    expect(heights.length, 'mismo número de filas que al medir').toBe(pinned.length);
    heights.forEach((height, index) => {
      expect(height, `fila ${String(index + 1)}`).toBeLessThanOrEqual(
        (pinned[index] ?? 0) + ROW_HEIGHT_TOLERANCE
      );
    });
  });
});

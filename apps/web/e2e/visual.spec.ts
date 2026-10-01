// Paso D.1b (spec visual-regression-suite R9, S9.1-S9.3) — una captura de
// página completa por ruta y proyecto (6 x 6 = 36). Los baselines solo se
// generan dentro del contenedor Docker (decisión 136).
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

test.describe('capturas visuales', () => {
  for (const route of ROUTES) {
    test(`captura ${route.name}`, async ({ page }) => {
      await openRoute(page, route);
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

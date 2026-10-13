// Paso D.1b (spec visual-regression-suite R9, S9.1-S9.3) — una captura de
// página completa por ruta y proyecto (16 x 6 = 96). Los baselines solo se
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
        // D.13: la hora de reinicio del tope (aviso del tope global) depende de la fecha
        // del servidor; se enmascara. Es `tabular-nums`, así que el ancho no cambia.
        mask: [page.locator('.coverage-notice__reset')],
      });
    });
  }
});

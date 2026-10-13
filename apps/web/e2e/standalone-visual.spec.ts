// D.17 (decisión 211; spec standalone-page-visual-coverage) — capturas y axe de las tres páginas
// que no cuelgan de ninguna ruta de `ROUTES`: `error.tsx`, `global-error.tsx` y la 429 del proxy.
// 3 páginas x 6 proyectos = 18 baselines. Las dos primeras se activan de verdad con rutas
// inyectadas SOLO en la imagen Docker (`e2e/inject/app`, decisión 209); la 429 sale del segundo
// servidor (3101, limitador activo con tope 1, decisión 189).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { AXE_TAGS } from './axe-baseline';
import { expect, test } from './fixtures';

const ERROR_BOUNDARY_PATH = '/e2e-only/error-boundary';
const GLOBAL_ERROR_PATH = '/e2e-only/global-error';
const REFERENCE_PATH = '/no-existe';
const LIMITED_ORIGIN = 'http://127.0.0.1:3101';
const ERROR_TITLE = 'No hemos podido cargar esta página';
const GLOBAL_ERROR_TITLE = 'Buscahogar no está disponible ahora mismo';
const RATE_LIMIT_TITLE = 'Demasiadas peticiones seguidas';
const RATE_LIMIT_WAIT = 'Espera 60 minutos';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
// Mismo orden que `projects` en `playwright.config.ts`: el índice reparte los cubos del limitador.
const PROJECT_NAMES = [
  'w320-light',
  'w320-dark',
  'w768-light',
  'w768-dark',
  'w1280-light',
  'w1280-dark',
];
// Reservado por proyecto: hasta 4 IP por proyecto (una por reintento), sin solaparse entre ellos.
const IPS_PER_PROJECT = 4;
// Rango de documentación RFC 5737: nunca es una IP real.
const CLIENT_IP_PREFIX = '198.51.100.';

type Scheme = 'light' | 'dark';

function schemeOf(projectName: string): Scheme {
  return projectName.endsWith('-dark') ? 'dark' : 'light';
}

// Las tres páginas eligen el esquema con `prefers-color-scheme` (directo o vía el script de tema
// con «sistema»): la captura solo es válida si el navegador y el fondo reflejan el esquema del
// proyecto. Un fondo transparente delataría un `<style>` bloqueado por la CSP.
async function expectThemeApplied(page: Page, scheme: Scheme): Promise<void> {
  const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  expect(dark, 'matchMedia refleja el esquema del proyecto').toBe(scheme === 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background, 'el fondo del cuerpo no es transparente').not.toBe(TRANSPARENT);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(results.violations).toEqual([]);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
  });
}

test.describe('páginas autónomas (D.17)', () => {
  test('error.tsx: frontera de error raíz', async ({ page }, testInfo) => {
    await page.goto(ERROR_BOUNDARY_PATH);
    await expect(page.getByRole('heading', { level: 1, name: ERROR_TITLE })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expectThemeApplied(page, schemeOf(testInfo.project.name));
    await capture(page, 'error-boundary');
    await expectNoAxeViolations(page);
  });

  test('global-error.tsx: frontera de último recurso', async ({ page }, testInfo) => {
    await page.goto(GLOBAL_ERROR_PATH);
    // El servidor entrega el armazón de error de Next y el cliente pinta después el título.
    await expect(page.getByRole('heading', { level: 1, name: GLOBAL_ERROR_TITLE })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expectThemeApplied(page, schemeOf(testInfo.project.name));
    await capture(page, 'global-error');
    await expectNoAxeViolations(page);
  });

  test.describe('429 del proxy', () => {
    test.use({ baseURL: LIMITED_ORIGIN });

    test('página 429 con el cubo del limitador propio del proyecto', async ({
      page,
      context,
    }, testInfo) => {
      const index = PROJECT_NAMES.indexOf(testInfo.project.name);
      expect(index, `proyecto desconocido ${testInfo.project.name}`).toBeGreaterThanOrEqual(0);
      // Una IP por proyecto (y reintento): cada uno agota su propio cupo de 1 sin tocar el de los
      // demás ni el cubo «unknown» que usa `rate-limit.spec.ts`.
      const clientIp = `${CLIENT_IP_PREFIX}${String(index * IPS_PER_PROJECT + testInfo.retry + 1)}`;
      await context.setExtraHTTPHeaders({ 'x-e2e-client-ip': clientIp });

      // La primera petición consume el cupo (cualquier estado); la segunda recibe la 429.
      await page.goto(REFERENCE_PATH);
      const limited = await page.goto(REFERENCE_PATH);
      expect(limited?.status()).toBe(429);

      await expect(page.getByRole('heading', { level: 1, name: RATE_LIMIT_TITLE })).toBeVisible();
      // Ventana de 3600 s: dentro de un mismo test quedan más de 3540 s, que se muestran como 60 min.
      await expect(page.locator('.standalone p')).toContainText(RATE_LIMIT_WAIT);
      await expectThemeApplied(page, schemeOf(testInfo.project.name));
      await capture(page, 'rate-limit');
      await expectNoAxeViolations(page);
    });
  });
});

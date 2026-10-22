// ROADMAP 3.4 (decisión 263; R10.3) — las cookies REALES del navegador son un subconjunto de {theme}.
// Complementa al escáner estático (`test/cookie-allowlist.test.ts`): aquí se mira lo que el servidor de
// producción deja en el contexto tras visitar las rutas públicas (inicio, búsqueda, ficha y páginas
// legales) y tras usar el único control que crea una cookie. Un solo proyecto: no depende del ancho.
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const ONLY_PROJECT = 'w1280-light';
const ALLOWED_COOKIES = ['theme'];
const VISITED_ROUTES = [
  'home',
  'map',
  'nl-query',
  'detail',
  'legal-privacy',
  'legal-cookies',
  'legal-notice',
  'not-found-route',
];

test.describe('lista permitida de cookies', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('las rutas elegidas existen (la comprobación no pasa en vacío)', () => {
    const names = ROUTES.map((route) => route.name);
    for (const name of VISITED_ROUTES) {
      expect(names).toContain(name);
    }
  });

  for (const name of VISITED_ROUTES) {
    test(`${name}: visitarla sin elegir tema no deja ninguna cookie`, async ({ page, context }) => {
      const route = ROUTES.find((candidate) => candidate.name === name);
      expect(route).toBeDefined();
      if (route === undefined) return;
      await openRoute(page, route);
      const names = (await context.cookies()).map((cookie) => cookie.name);
      expect(names.filter((cookie) => !ALLOWED_COOKIES.includes(cookie))).toEqual([]);
      // Sin pulsar el selector no existe ni siquiera `theme`.
      expect(names).toEqual([]);
    });
  }

  test('tras elegir tema, la única cookie del contexto es theme', async ({ page, context }) => {
    await page.goto('/legal/cookies');
    await page.getByRole('banner').getByRole('button', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).toEqual(ALLOWED_COOKIES);
  });
});

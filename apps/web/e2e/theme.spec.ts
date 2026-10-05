// Paso D.4 (spec del selector de tema; diseño «e2e») — comportamiento extremo a
// extremo de POST /theme y del selector de la cabecera (D.5), sobre la 404 (no depende de datos).
// Se ejecuta en UN solo proyecto: no depende del ancho ni del esquema de color.
import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';
const NOT_FOUND_PATH = '/no-existe';

// El selector vive en la cabecera (landmark banner), no en el pie.
const inBanner = (page: Page): Locator => page.getByRole('banner');

test.describe('selector de tema', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('Oscuro conserva la URL, aplica la clase y guarda la cookie; recargar la mantiene', async ({
    page,
    context,
  }) => {
    await page.goto(NOT_FOUND_PATH);
    await inBanner(page).getByRole('button', { name: 'Oscuro' }).click();

    // El 303 devuelve a la misma página.
    await expect(page).toHaveURL(NOT_FOUND_PATH);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const [cookie] = await context.cookies();
    expect(cookie).toMatchObject({ name: 'theme', value: 'dark', sameSite: 'Lax', secure: false });

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('Sistema borra la cookie y la clase', async ({ page, context }) => {
    await page.goto(NOT_FOUND_PATH);
    await inBanner(page).getByRole('button', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await inBanner(page).getByRole('button', { name: 'Sistema' }).click();
    await expect(page.locator('html')).not.toHaveClass(/\b(dark|light)\b/);
    expect(await context.cookies()).toEqual([]);
  });

  test('GET /theme responde 405', async ({ request }) => {
    const response = await request.get('/theme');
    expect(response.status()).toBe(405);
  });

  // `APIRequestContext` no envía Referer (verificado: sin él, el destino es `/`).
  test('POST sin Referer vuelve a «/» con 303 y cookie', async ({ request }) => {
    const response = await request.post('/theme', { form: { theme: 'light' }, maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe('/');
    expect(response.headers()['set-cookie']).toContain('theme=light');
  });

  test('un returnTo protocol-relative nunca se sigue (multipart)', async ({ request }) => {
    const response = await request.post('/theme', {
      multipart: { theme: 'dark', returnTo: '//evil.example' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe('/');
  });

  test('un returnTo que normaliza a protocol-relative nunca se sigue (urlencoded)', async ({
    request,
  }) => {
    const response = await request.post('/theme', {
      form: { theme: 'dark', returnTo: '/..//evil.example' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe('/');
  });

  test.describe('sin JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('guarda la cookie pero no aplica clase', async ({ page, context }) => {
      await page.goto(NOT_FOUND_PATH);
      await inBanner(page).getByRole('button', { name: 'Oscuro' }).click();

      await expect(page).toHaveURL(NOT_FOUND_PATH);
      const [cookie] = await context.cookies();
      expect(cookie).toMatchObject({ name: 'theme', value: 'dark' });
      expect((await page.locator('html').getAttribute('class')) ?? '').not.toMatch(
        /\b(dark|light)\b/
      );
    });
  });
});

// D.14 (decisión 189; spec global-states, 429) — la página 429 del proxy contra un segundo
// servidor `next start` en el puerto 3101 con el limitador activo y tope 1 (ver
// `playwright.config.ts`). El servidor de 3100 deja el limitador desactivado, así que el resto del
// e2e nunca se limita. Un solo proyecto y como mucho tres peticiones: el cupo de 3101 es de una.
import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';
const LIMITED_ORIGIN = 'http://127.0.0.1:3101';
const REFERENCE_PATH = '/no-existe';

test.describe('limitador del proxy (429)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('la segunda petición recibe la página 429 con sus cabeceras', async ({
    request,
    baseURL,
  }) => {
    const reference = await request.get(`${baseURL ?? ''}${REFERENCE_PATH}`);
    const referenceCsp = reference.headers()['content-security-policy'];
    expect(referenceCsp).toBeTruthy();

    const first = await request.get(`${LIMITED_ORIGIN}${REFERENCE_PATH}`);
    expect(first.status()).toBe(404);

    const limited = await request.get(`${LIMITED_ORIGIN}${REFERENCE_PATH}`);
    const headers = limited.headers();
    expect(limited.status()).toBe(429);
    expect(headers['content-type']).toBe('text/html; charset=utf-8');
    expect(headers['retry-after']).toMatch(/^\d+$/);
    expect(headers['cache-control']).toBe('no-store');
    expect(Object.keys(headers).filter((name) => name.startsWith('ratelimit'))).toEqual([]);
    expect(headers['content-security-policy']).toBe(referenceCsp);
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['content-security-policy']).toMatch(/style-src[^;]*'unsafe-inline'/);

    const body = await limited.text();
    expect(body).toContain('<h1>Demasiadas peticiones seguidas</h1>');
    expect(body).toContain('Has hecho muchas peticiones en poco tiempo');
    expect(body).not.toContain('Too Many Requests');
  });
});

// Paso D.1a (spec R7 S7.1 y R8 S8.3; diseño A6, tareas 1.1 y 3.5) — humo del
// servidor de producción y autoprueba del guard de red. Se ejecuta en UN solo
// proyecto: no depende del ancho ni del esquema de color.
import { expect, test } from './fixtures';

const ONLY_PROJECT = 'w1280-light';

test.describe('guard de red y servidor de producción', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('S7.1 la home carga por http con estado 200 y ningún recurso se mejora a https', async ({
    page,
    baseURL,
    externalRequests,
  }) => {
    const origins = new Set<string>();
    page.on('request', (request) => {
      origins.add(new URL(request.url()).origin);
    });

    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    expect(response?.url()).toBe(`${baseURL ?? ''}/`);
    // La CSP de producción lleva `upgrade-insecure-requests` (decisión 080): el
    // resultado de esta prueba es la verificación de que, sobre http://127.0.0.1,
    // el navegador NO la aplica (de ser así habría un origen https en la lista).
    expect(response?.headers()['content-security-policy']).toContain('upgrade-insecure-requests');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agregador inmobiliario');
    expect([...origins]).toEqual([new URL(baseURL ?? '').origin]);
    expect(externalRequests).toEqual([]);
  });

  // S8.3 — el guard FALLA un test que pide un host externo. `test.fail()` invierte
  // el resultado: esta prueba pasa solo si el test interno falla. La petición sale
  // de `about:blank` (sin CSP) para que llegue al nivel de red y la intercepte el
  // guard; desde la app, la propia CSP la bloquearía antes y no probaría nada.
  test('S8.3 una petición a un host externo es abortada, registrada y hace fallar el test', async ({
    page,
    externalRequests,
  }) => {
    test.fail();

    await page.goto('about:blank');
    const outcome = await page.evaluate(() =>
      fetch('https://example.com/x').then(
        () => 'resuelta',
        () => 'abortada'
      )
    );

    // El guard actuó sobre la petición real: abortada y registrada con su host.
    expect(outcome).toBe('abortada');
    expect(externalRequests).toEqual(['https://example.com/x']);
    // Al terminar, la comprobación automática de la fixture falla este test (de ahí `test.fail()`).
  });
});

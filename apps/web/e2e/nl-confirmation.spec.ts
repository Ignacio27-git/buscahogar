// Paso D.7 (spec nl-search-confirmation S1.1, S1.5, S9.3 y home-search-text-entry
// S10.1) — el flujo describir, revisar y buscar sobre el servidor de producción.
// Los pasos y el panel son HTML de servidor: el último caso corre sin JavaScript.
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const STEPS = 'ol[aria-label="Pasos de la búsqueda"]';
const CURRENT_STEP = `${STEPS} > li[aria-current="step"]`;

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

test.describe('indicador de pasos y panel de revisión', () => {
  test.beforeEach(() => {
    test.skip(!['w320-light', 'w1280-light'].includes(test.info().project.name), 'solo claro, ancho móvil y de escritorio');
  });

  test('nl-query: un único estado, paso «Revisa» y la nota de la zona exacta', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    await expect(page.locator('p[role="status"]')).toHaveCount(1);
    await expect(page.locator(CURRENT_STEP)).toHaveCount(1);
    await expect(page.locator(CURRENT_STEP)).toContainText('Revisa');
    await expect(page.locator('.zone-field__note')).toHaveText(
      'Getafe es el único municipio que se llama así, por eso está marcado. Si no es el que buscas, elige «Sin zona».'
    );
  });

  test('S1.1: en la home el paso actual es «Describe»', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator(`${STEPS} > li`)).toHaveCount(3);
    await expect(page.locator(CURRENT_STEP)).toContainText('Describe');
  });

  test('con filtros aplicados no hay indicador de pasos', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    await expect(page.locator(STEPS)).toHaveCount(0);
  });

  test('S1.5: un envío del formulario de criterios con todo en blanco no muestra los pasos', async ({ page }) => {
    await page.goto(
      '/?form=criteria&operation=&propertyType=&minPrice=&maxPrice=&minSurface=&maxSurface=&minRooms=&minBathrooms=&sort=&dir='
    );
    await expect(page.locator(STEPS)).toHaveCount(0);
  });

  for (const name of ['home', 'home-filtered', 'map', 'nl-query']) {
    test(`S10.1: ${name} lleva el botón «Convertir en filtros» y la ayuda enlazada`, async ({ page }) => {
      await openRoute(page, route(name));
      const search = page.getByRole('search');
      await expect(search.getByRole('button', { name: 'Convertir en filtros' })).toBeVisible();
      await expect(search.getByRole('searchbox')).toHaveAccessibleDescription(
        'Por ejemplo: «Piso en alquiler en Getafe hasta 900 € con 2 habitaciones»'
      );
    });
  }
});

// S9.3: la rama `?q=` no desborda en ningún ancho ni esquema.
test('S9.3: nl-query sin desbordamiento horizontal', async ({ page }) => {
  await openRoute(page, route('nl-query'));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('«Sin zona» y «Buscar» llevan a la búsqueda normal con los filtros interpretados', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto(route('nl-query').path);
    await page.getByLabel('Sin zona (cualquier municipio)').check();
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.waitForURL(/operation=rent/);
    const params = new URL(page.url()).searchParams;
    expect(params.get('operation')).toBe('rent');
    expect(params.get('maxPrice')).toBe('900');
    expect(params.get('minRooms')).toBe('2');
    expect(params.has('q')).toBe(false);
    expect(params.get('zone') ?? '').toBe('');
    await expect(page.locator(STEPS)).toHaveCount(0);
  });
});

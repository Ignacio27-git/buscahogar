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
      // D.18 (decisión 228): fuera del inicio y de `?q=` la caja llega plegada; se abre con su resumen.
      const disclosure = search.locator('details.nl-disclosure');
      if (!(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open))) {
        await search.getByText('Describe lo que buscas', { exact: true }).first().click();
      }
      await expect(page.getByLabel('Describe lo que buscas')).toBeVisible();
      await expect(search.getByRole('button', { name: 'Convertir en filtros' })).toBeVisible();
      await expect(search.getByRole('searchbox')).toHaveAccessibleDescription(
        'Por ejemplo: «Piso en alquiler en Getafe hasta 900 € con 2 habitaciones»'
      );
    });
  }
});

// D.18 (decisión 228, C-14): la caja de texto es un <details> en <search>. Abierta en el inicio, en
// `?q=` y con una zona desconocida; plegada en el resto de resultados, a 320 y a 1280 px.
test.describe('caja de texto plegable (D.18)', () => {
  test.beforeEach(() => {
    test.skip(!['w320-light', 'w1280-light'].includes(test.info().project.name), 'solo claro, ancho móvil y de escritorio');
  });

  const isOpen = (page: import('@playwright/test').Page): Promise<boolean> =>
    page.locator('search details.nl-disclosure').evaluate((element) => (element as HTMLDetailsElement).open);

  for (const [name, expected] of [
    ['home', true],
    ['nl-query', true],
    ['home-filtered', false],
    ['map', false],
  ] as const) {
    test(`${name}: ${expected ? 'abierta' : 'plegada'}`, async ({ page }) => {
      await openRoute(page, route(name));
      expect(await isOpen(page)).toBe(expected);
      await expect(page.getByRole('search')).toHaveCount(1);
    });
  }

  test('zona desconocida: abierta, porque su aviso manda escribir el municipio ahí', async ({ page }) => {
    await page.goto('/?zone=00000');
    expect(await isOpen(page)).toBe(true);
  });

  test('plegada: el resumen la abre y el campo se anuncia «Describe lo que buscas»', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    await expect(page.getByRole('searchbox')).toBeHidden();
    await page.locator('search summary').click();
    expect(await isOpen(page)).toBe(true);
    await expect(page.getByRole('searchbox', { name: 'Describe lo que buscas' })).toBeVisible();
  });

  test('con teclado: el resumen va antes que la bandeja de filtros y Enter lo abre', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    const nl = page.locator('search summary');
    const tray = page.locator('details.filter-tray > summary');
    for (let tab = 0; tab < 80; tab += 1) {
      if (await nl.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(nl).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await isOpen(page)).toBe(true);
    // Tras abrir, el siguiente foco entra en la caja y luego en el botón, antes de la bandeja.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Convertir en filtros' })).toBeFocused();
    if (await tray.isVisible()) {
      await page.keyboard.press('Tab');
      await expect(tray).toBeFocused();
    }
  });
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

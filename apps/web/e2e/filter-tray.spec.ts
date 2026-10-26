// Paso D.6b (spec mobile-filter-tray S19/S20, decisión 153; search-result-card S11)
// — bandeja de filtros, filas de resultado y paginador sobre el servidor de
// producción. A 320px la bandeja está cerrada y funciona con teclado y sin
// JavaScript; desde 64rem el formulario está siempre visible (Chromium
// soporta `::details-content`; Firefox y Safari se comprueban a mano).
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';
import { openFilterTray, traySummary } from './tray';

const BAR = 'Filtros de búsqueda';
const MAX_TABS = 60;

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

test.describe('bandeja de filtros a 320px (S19)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
  });

  test('cerrada por defecto: se ve «Filtros» y no el formulario', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(traySummary(page)).toBeVisible();
    await expect(traySummary(page)).toContainText('Filtros');
    await expect(page.locator('details.filter-tray')).not.toHaveAttribute('open', /.*/);
    await expect(page.getByRole('form', { name: BAR })).toHaveCount(0);
  });

  test('con teclado: Tab llega al resumen, Enter abre y el siguiente Tab entra en los campos', async ({
    page,
  }) => {
    await openRoute(page, route('home'));
    const summary = traySummary(page);
    for (let tab = 0; tab < MAX_TABS; tab += 1) {
      if (await summary.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.filter-tray')).toHaveAttribute('open', /.*/);
    await expect(page.getByRole('form', { name: BAR })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Operación')).toBeFocused();
  });

  // D.18 (decisión 226): «Filtros N» cuenta los mismos filtros que los chips, la zona incluida; el
  // orden no es un filtro.
  test('el número de filtros activos se anuncia, cuenta la zona y no cuenta el orden', async ({ page }) => {
    await page.goto('/?operation=sale&maxPrice=300000&sort=price&zone=28074');
    await expect(traySummary(page)).toContainText('3');
    await expect(traySummary(page).locator('.sr-only')).toHaveText(' activos');
    await expect(page.getByRole('region', { name: 'Filtros aplicados' }).getByRole('link')).toHaveCount(3);
  });

  test('parámetros inválidos: la bandeja llega abierta y sin número', async ({ page }) => {
    await page.goto('/?minPrice=900&maxPrice=100');
    await expect(page.locator('details.filter-tray')).toHaveAttribute('open', /.*/);
    await expect(page.getByRole('form', { name: BAR })).toBeVisible();
    await expect(traySummary(page)).not.toContainText(/\d/);
  });
});

test.describe('bandeja de filtros sin JavaScript (S19)', () => {
  test.use({ javaScriptEnabled: false });

  test('se abre y el envío funciona como un GET de formulario', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto('/');
    await traySummary(page).click();
    const bar = page.getByRole('form', { name: BAR });
    await expect(bar).toBeVisible();
    await bar.getByLabel('Operación').selectOption('sale');
    await bar.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/operation=sale/);
    await expect(traySummary(page)).toContainText('1');
  });
});

test.describe('bandeja de filtros a 1280px (S20)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'w1280-light', 'solo el ancho de escritorio');
  });

  // D.22 (decisión 268, HH-3): la portada sin parámetros pliega la bandeja también en escritorio, así
  // que la comprobación de «siempre visible» se hace sobre una página de resultados.
  test('el formulario está siempre visible, el resumen oculto y Tab llega al primer campo', async ({
    page,
  }) => {
    await page.goto('/?operation=sale');
    await page.evaluate(() => document.fonts.ready);
    await expect(traySummary(page)).toBeHidden();
    await expect(page.getByRole('form', { name: BAR })).toBeVisible();
    const operation = page.getByLabel('Operación');
    for (let tab = 0; tab < MAX_TABS; tab += 1) {
      if (await operation.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(operation).toBeFocused();
  });
});

// S11: sin desbordamiento horizontal en los tres anchos y ambos temas, con la
// bandeja cerrada y abierta; y objetivos táctiles de al menos 24px.
test.describe('filas de resultado y paginador', () => {
  for (const name of ['home', 'home-filtered']) {
    test(`${name}: sin desbordamiento horizontal, con la bandeja cerrada y abierta`, async ({
      page,
    }) => {
      await openRoute(page, route(name));
      const overflow = (): Promise<number> =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await openFilterTray(page);
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }

  test('cada fila tiene un único enlace con la miniatura reservada (4:3)', async ({ page }) => {
    await openRoute(page, route('home'));
    const rows = page.locator('ul.result-list > li');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index).getByRole('link')).toHaveCount(1);
    }
    const box = await rows.first().locator('.result-row__media').boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 4 / 3)).toBeLessThan(0.02);
  });

  // El seed tiene menos de una página: `?page=2` es la forma de ver el paginador
  // (página 2 sin siguiente: «anterior» es enlace y «siguiente» texto).
  test('paginador: objetivos de al menos 24px y sin desbordamiento', async ({ page }) => {
    await page.goto('/?page=2');
    const nav = page.getByRole('navigation', { name: 'Paginación de resultados' });
    await expect(nav).toContainText('Página 2');
    const previous = nav.getByRole('link', { name: 'Página anterior' });
    const box = await previous.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    await expect(nav.getByRole('link')).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// D.22 (decisión 268; specs home-hero HH-1..HH-4) — la portada sin parámetros: titular de la propuesta de
// valor, caja de texto promovida, búsquedas de ejemplo y filtros avanzados plegados. Se ejecuta sobre el
// servidor de producción con la siembra e2e (paso 6 de D.22: Docker + base de datos); aquí solo se escribe.
import AxeBuilder from '@axe-core/playwright';

import { EXAMPLE_SEARCHES } from '../src/lib/example-searches';

import { AXE_TAGS, fingerprintViolations } from './axe-baseline';
import { expect, test } from './fixtures';
import { openFilterTray, traySummary } from './tray';

const HERO_TITLE = 'Todas las viviendas de los portales, en una sola búsqueda';
const BAR = 'Filtros de búsqueda';
const MAX_TABS = 80;

function onlyProjects(...names: string[]): void {
  test.skip(!names.includes(test.info().project.name), `solo ${names.join(', ')}`);
}

test.describe('portada con invitación (HH-1, HH-2, HH-4)', () => {
  test('el titular es el único h1 y la franja lleva caja de texto, pasos y ejemplos', async ({ page }) => {
    onlyProjects('w320-light', 'w1280-light');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_TITLE);
    const hero = page.locator('section.home-hero');
    await expect(hero.getByRole('search')).toHaveCount(1);
    await expect(hero.getByRole('searchbox')).toBeVisible();
    await expect(hero.getByRole('list', { name: 'Pasos de la búsqueda' })).toBeVisible();
    await expect(hero.getByRole('list', { name: 'Búsquedas para empezar' }).getByRole('link')).toHaveCount(
      EXAMPLE_SEARCHES.length
    );
  });

  test('una página de resultados no lleva franja ni ejemplos y conserva el título genérico', async ({ page }) => {
    onlyProjects('w320-light', 'w1280-light');
    await page.goto('/?operation=sale');
    await expect(page.locator('.home-hero')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Búsquedas para empezar' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buscar vivienda');
  });

  test('cada ejemplo mide al menos 44 px de alto y se ve como un enlace distinto del texto', async ({ page }) => {
    onlyProjects('w320-light', 'w1280-light');
    await page.goto('/');
    const links = page.getByRole('list', { name: 'Búsquedas para empezar' }).getByRole('link');
    const heights = await links.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height));
    expect(heights).toHaveLength(EXAMPLE_SEARCHES.length);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(43.5);
    // Rellena con la superficie elevada y borde: no es texto corrido subrayado.
    const style = await links.first().evaluate((el) => {
      const computed = getComputedStyle(el);
      return { decoration: computed.textDecorationLine, border: computed.borderTopWidth };
    });
    expect(style.decoration).toBe('none');
    expect(style.border).toBe('1px');
  });

  // N6: los ejemplos usan el anillo de foco global, sin ninguna regla propia.
  test('N6: con el teclado, un ejemplo enfocado dibuja el anillo global de 2 px', async ({ page }) => {
    onlyProjects('w1280-light');
    await page.goto('/');
    const first = page.getByRole('list', { name: 'Búsquedas para empezar' }).getByRole('link').first();
    for (let tab = 0; tab < MAX_TABS; tab += 1) {
      if (await first.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(first).toBeFocused();
    const ring = await first.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { width: computed.outlineWidth, style: computed.outlineStyle, offset: computed.outlineOffset };
    });
    expect(ring).toEqual({ width: '2px', style: 'solid', offset: '2px' });
  });

  test.describe('sin JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    // HH-2: cada ejemplo es un enlace GET; navega a la lista con exactamente sus criterios (sin zona,
    // texto ni paginación) y la página los acepta (sin alerta de parámetro inválido).
    for (const search of EXAMPLE_SEARCHES) {
      test(`«${search.label}» navega a la lista con sus criterios`, async ({ page }) => {
        onlyProjects('w1280-light');
        await page.goto('/');
        await page.getByRole('link', { name: search.label, exact: true }).click();
        const params = new URL(page.url()).searchParams;
        expect(Object.fromEntries(params)).toEqual(search.params);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buscar vivienda');
        await expect(page.locator('p[role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Resultados', exact: true })).toBeVisible();
      });
    }
  });
});

test.describe('filtros avanzados plegados (HH-3)', () => {
  test('llegan cerrados a 320 y a 1280 px, con el resumen visible y operable con teclado', async ({ page }) => {
    onlyProjects('w320-light', 'w1280-light');
    await page.goto('/');
    await expect(traySummary(page)).toBeVisible();
    await expect(page.locator('details.filter-tray')).not.toHaveAttribute('open', /.*/);
    await expect(page.getByRole('form', { name: BAR })).toBeHidden();
    for (let tab = 0; tab < MAX_TABS; tab += 1) {
      if (await traySummary(page).evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(traySummary(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.filter-tray')).toHaveAttribute('open', /.*/);
    await expect(page.getByRole('form', { name: BAR })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Operación')).toBeFocused();
  });

  // La URL del envío es la de siempre: la marca del formulario y todos los campos, los vacíos incluidos,
  // en el orden de la barra; ni zona, ni texto, ni paginación, ni orden.
  test('al enviar con los filtros desplegados la URL es la que producía la barra antes de D.22', async ({ page }) => {
    onlyProjects('w320-light', 'w1280-light');
    await page.goto('/');
    await openFilterTray(page);
    const bar = page.getByRole('form', { name: BAR });
    await bar.getByLabel('Operación').selectOption('sale');
    await bar.getByLabel('Precio máximo (€)').fill('200000');
    await bar.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/operation=sale/);

    const params = new URL(page.url()).searchParams;
    expect(params.get('form')).toBe('criteria');
    expect(params.get('operation')).toBe('sale');
    expect(params.get('maxPrice')).toBe('200000');
    const filled = [...params].filter(([, value]) => value !== '').map(([key]) => key);
    expect(filled.sort()).toEqual(['form', 'maxPrice', 'operation']);
    for (const key of ['q', 'zone', 'zoneQuery', 'polygon', 'page', 'sort', 'dir', 'view']) {
      expect(params.has(key), key).toBe(false);
    }
    await expect(page.getByRole('region', { name: 'Filtros aplicados' }).getByRole('link')).toHaveCount(2);
  });

  test.describe('sin JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('el resumen despliega la barra y el envío es un GET de formulario', async ({ page }) => {
      onlyProjects('w1280-light');
      await page.goto('/');
      await traySummary(page).click();
      const bar = page.getByRole('form', { name: BAR });
      await expect(bar).toBeVisible();
      await bar.getByLabel('Operación').selectOption('rent');
      await bar.getByRole('button', { name: 'Aplicar filtros' }).click();
      await expect(page).toHaveURL(/operation=rent/);
    });
  });
});

// HH-4: axe sin violaciones con la portada tal cual y con los filtros desplegados, en claro y oscuro.
test.describe('accesibilidad de la portada (HH-4)', () => {
  test('axe: cero violaciones con la bandeja cerrada y abierta', async ({ page }) => {
    onlyProjects('w320-light', 'w320-dark', 'w1280-light', 'w1280-dark');
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const closed = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
    expect(fingerprintViolations(closed.violations)).toEqual([]);

    await openFilterTray(page);
    await expect(page.getByRole('form', { name: BAR })).toBeVisible();
    const open = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
    expect(fingerprintViolations(open.violations)).toEqual([]);
  });
});

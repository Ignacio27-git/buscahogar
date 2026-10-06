// Paso D.6a (spec search-filters) — barra de filtros, filtros aplicados y recuento
// sobre el servidor de producción. El desbordamiento a 320px de la ruta
// `home-filtered` lo cubre `landmarks.spec.ts` (recorre todas las rutas); aquí se
// comprueban el orden de los campos, los nombres accesibles y el flujo sin
// JavaScript del envío (un GET de formulario).
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';
import { openFilterTray } from './tray';

const BAR = 'Filtros de búsqueda';

const FIELD_ORDER = [
  'operation',
  'propertyType',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'minBathrooms',
  'sort',
  'dir',
];

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

test.describe('barra de filtros y filtros aplicados', () => {
  test.beforeEach(() => {
    test.skip(
      !['w320-light', 'w1280-light'].includes(test.info().project.name),
      'el comportamiento no depende del esquema ni del ancho intermedio'
    );
  });

  test('los campos de la barra van en el orden de la especificación', async ({ page }) => {
    await openRoute(page, route('home'));
    // D.6b: a 320px el formulario está en la bandeja, cerrada por defecto.
    await openFilterTray(page);
    const names = await page
      .getByRole('form', { name: BAR })
      .locator('input:not([type="hidden"]), select')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('name')));
    expect(names).toEqual(FIELD_ORDER);
  });

  test('con nueve filtros hay nueve chips cuyo nombre accesible empieza por «Quitar»', async ({
    page,
  }) => {
    await openRoute(page, route('home-filtered'));
    const links = page.getByRole('region', { name: 'Filtros aplicados' }).getByRole('link');
    await expect(links).toHaveCount(9);
    const names = await links.evaluateAll((elements) =>
      elements.map((element) => element.textContent)
    );
    for (const name of names) {
      expect(name).toMatch(/^Quitar filtro: /);
    }
    await expect(page.getByRole('link', { name: 'Quitar todos los filtros' })).toBeVisible();
  });

  test('sin filtros no hay chips ni «Quitar todos», pero el recuento sigue', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.getByRole('region', { name: 'Filtros aplicados' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Quitar/ })).toHaveCount(0);
    await expect(page.getByText(/^\d+ resultados?/)).toBeVisible();
  });

  test('la rama ?q= no lleva la barra y conserva un único role=search', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.getByRole('form', { name: BAR })).toHaveCount(0);
  });

  test('aplicar la barra equivale a escribir la URL y deja un chip por filtro', async ({
    page,
  }) => {
    await openRoute(page, route('home'));
    await openFilterTray(page);
    const bar = page.getByRole('form', { name: BAR });
    await bar.getByLabel('Operación').selectOption('sale');
    await bar.getByLabel('Precio máximo (€)').fill('200000');
    await bar.getByRole('button', { name: 'Aplicar filtros' }).click();

    const params = new URL(page.url()).searchParams;
    expect(params.get('operation')).toBe('sale');
    expect(params.get('maxPrice')).toBe('200000');
    expect(params.has('page')).toBe(false);
    const chips = page.getByRole('region', { name: 'Filtros aplicados' }).getByRole('link');
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toContainText('Operación: Venta');
  });

  test('un chip quita solo su filtro', async ({ page }) => {
    await page.goto('/?operation=sale&maxPrice=200000&sort=price&dir=asc');
    await page.getByRole('link', { name: /Quitar filtro: Precio hasta/ }).click();
    const params = new URL(page.url()).searchParams;
    expect([...params.keys()].sort()).toEqual(['dir', 'operation', 'sort']);
  });

  test('parámetros inválidos: alerta y valores recibidos editables en la barra', async ({
    page,
  }) => {
    await page.goto('/?minPrice=900&maxPrice=100');
    // `p[role=alert]`: Next también monta un anunciador de rutas con ese rol.
    await expect(page.locator('p[role="alert"]')).toContainText('minPrice no puede ser mayor que maxPrice');
    const bar = page.getByRole('form', { name: BAR });
    await expect(bar.getByLabel('Precio mínimo (€)')).toHaveValue('900');
    await expect(bar.getByLabel('Precio máximo (€)')).toHaveValue('100');
  });
});

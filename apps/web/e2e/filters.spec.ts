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
    // Refinamiento de C-11: esta ruta no devuelve resultados, pero con nueve chips la fila ya ofrece
    // «Quitar todos»; el estado vacío no repite un enlace idéntico (WCAG 3.2.4 y menos ruido).
    const clearAll = page.getByRole('link', { name: 'Quitar todos los filtros' });
    await expect(clearAll).toHaveCount(1);
    await expect(clearAll).toBeVisible();
    await expect(clearAll).toHaveAttribute('href', '/');
    await expect(
      page.getByRole('region', { name: 'Resultados', exact: true }).getByRole('link', {
        name: 'Quitar todos los filtros',
      })
    ).toHaveCount(0);
  });

  // D.18 (decisión 225, C-11): el estado vacío filtrado no repite los chips; una frase que remite a
  // ellos y, solo si la fila de chips no ofrece ya «Quitar todos» (un único chip), una acción.
  test('el estado vacío filtrado tiene la frase y ningún enlace repetido ni por filtro', async ({
    page,
  }) => {
    await openRoute(page, route('home-filtered'));
    const results = page.getByRole('region', { name: 'Resultados', exact: true });
    await expect(results.getByText('Ninguna vivienda coincide con tu búsqueda.')).toBeVisible();
    await expect(
      results.getByText('Los filtros aplicados están arriba; pulsa uno para quitarlo')
    ).toBeVisible();
    await expect(results.getByRole('link')).toHaveCount(0);
    await expect(results.getByRole('link', { name: /^Quitar «/ })).toHaveCount(0);
  });

  test('con un solo chip la fila no ofrece «Quitar todos» y el estado vacío sí', async ({ page }) => {
    // Un único filtro sin resultados en la siembra: ninguna vivienda tiene cincuenta habitaciones.
    await page.goto('/?minRooms=50');
    const results = page.getByRole('region', { name: 'Resultados', exact: true });
    await expect(results.getByText('Ninguna vivienda coincide con tu búsqueda.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quitar todos los filtros' })).toHaveCount(1);
    await expect(results.getByRole('link', { name: 'Quitar todos los filtros' })).toHaveAttribute('href', '/');
  });

  // Paso 3.2 (decisión 246, enmienda la 225): zona cubierta sin resultados. El detalle nombra el
  // municipio; no es una región viva (160) y la acción sigue siendo una sola (los chips ya ofrecen
  // «Quitar todos»). Una zona NO cubierta conserva el detalle de siempre.
  test('zona cubierta sin resultados: el detalle nombra el municipio y no hay región viva propia', async ({
    page,
  }) => {
    await openRoute(page, route('zone-covered-empty'));
    const results = page.getByRole('region', { name: 'Resultados', exact: true });
    await expect(results.getByText('Ninguna vivienda coincide con tu búsqueda.')).toBeVisible();
    const detail = results.getByText('Los anuncios de Getafe están al día', { exact: false });
    await expect(detail).toBeVisible();
    await expect(detail).not.toHaveAttribute('role', /.+/);
    await expect(results.locator('[role="status"], [role="alert"], [aria-live]')).toHaveCount(0);
    await expect(results.getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Quitar todos los filtros' })).toHaveCount(1);
  });

  test('zona no cubierta sin resultados: el detalle de siempre, sin el aviso de zona cubierta', async ({
    page,
  }) => {
    await openRoute(page, route('coverage-done'));
    const results = page.getByRole('region', { name: 'Resultados', exact: true });
    await expect(results.getByText('al día')).toHaveCount(0);
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

  // D.18 (decisión 227, C-9): la ordenación son enlaces predefinidos junto al recuento. Funcionan sin
  // JavaScript (anclas), conservan los filtros, reinician `page` y marcan el vigente con aria-current.
  test('los cinco enlaces de ordenación llevan sus rótulos y «Más recientes» está activo por defecto', async ({
    page,
  }) => {
    await openRoute(page, route('home'));
    const list = page.getByRole('list', { name: 'Ordenar por' });
    await expect(list.getByRole('link')).toHaveText([
      'Más recientes',
      'Precio: de menor a mayor',
      'Precio: de mayor a menor',
      'Superficie: de mayor a menor',
      'Superficie: de menor a mayor',
    ]);
    await expect(list.getByRole('link', { name: 'Más recientes' })).toHaveAttribute('aria-current', 'true');
    await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('select[name="sort"], select[name="dir"]')).toHaveCount(0);
    await expect(page.getByText('Sentido', { exact: true })).toHaveCount(0);
  });

  test('un enlace de ordenación conserva los filtros, quita page y marca el vigente', async ({ page }) => {
    await page.goto('/?operation=sale&page=1');
    await page.getByRole('link', { name: 'Precio: de menor a mayor' }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get('operation')).toBe('sale');
    expect(params.get('sort')).toBe('price');
    expect(params.get('dir')).toBe('asc');
    expect(params.has('page')).toBe(false);
    await expect(page.getByRole('link', { name: 'Precio: de menor a mayor' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    await expect(page.getByRole('link', { name: 'Más recientes' })).not.toHaveAttribute('aria-current', /.*/);
  });

  test('una combinación sin preset (updated/asc) no marca ningún enlace', async ({ page }) => {
    await page.goto('/?sort=updated&dir=asc');
    await expect(page.getByRole('list', { name: 'Ordenar por' }).locator('[aria-current]')).toHaveCount(0);
  });

  test('aplicar la barra conserva la ordenación elegida', async ({ page }) => {
    await page.goto('/?sort=price&dir=asc');
    await openFilterTray(page);
    const bar = page.getByRole('form', { name: BAR });
    await bar.getByLabel('Operación').selectOption('sale');
    await bar.getByRole('button', { name: 'Aplicar filtros' }).click();
    const params = new URL(page.url()).searchParams;
    expect(params.get('operation')).toBe('sale');
    expect(params.get('sort')).toBe('price');
    expect(params.get('dir')).toBe('asc');
  });

  test.describe('sin JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('el enlace de ordenación navega con anclas normales', async ({ page }) => {
      await page.goto('/?operation=sale');
      await page.getByRole('link', { name: 'Superficie: de mayor a menor' }).click();
      const params = new URL(page.url()).searchParams;
      expect(params.get('sort')).toBe('surface');
      expect(params.get('dir')).toBe('desc');
      expect(params.get('operation')).toBe('sale');
    });
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
    await expect(page.locator('p[role="alert"]')).toContainText('Precio mínimo (€): no puede ser mayor que el precio máximo');
    const bar = page.getByRole('form', { name: BAR });
    await expect(bar.getByLabel('Precio mínimo (€)')).toHaveValue('900');
    await expect(bar.getByLabel('Precio máximo (€)')).toHaveValue('100');
  });
});

// D.13b: los chips envuelven en varias líneas a 320 px (sin desplazamiento horizontal) y un chip
// muy largo se parte dentro de sí mismo en vez de desbordar. El texto largo se inyecta en el
// primer chip real: la fixture no trae un rótulo tan largo y lo que se prueba es la maqueta.
test.describe('chips de filtros aplicados a 320 px', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
  });

  test('con nueve filtros los chips envuelven y ninguno desborda', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    const list = page.getByRole('region', { name: 'Filtros aplicados' }).locator('ul');
    const overflow = await list.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const rows = await list
      .locator('a')
      .evaluateAll((chips) => new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size);
    expect(rows).toBeGreaterThan(1);
    const widest = await list
      .locator('a')
      .evaluateAll((chips) => Math.max(...chips.map((chip) => chip.scrollWidth - chip.clientWidth)));
    expect(widest).toBeLessThanOrEqual(0);
  });

  test('un chip con un texto larguísimo se parte dentro del chip y no desborda la página', async ({
    page,
  }) => {
    await openRoute(page, route('home-filtered'));
    const chip = page.getByRole('region', { name: 'Filtros aplicados' }).locator('a').first();
    await chip.evaluate((el) => {
      el.append(document.createTextNode('ÑandúCaminoDeLosPinaresDeLaSierraDeGuadarramaNorteSinEspacios1234567890'));
    });
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(await chip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });
});

// Paso D.5 (specs app-shell y page-metadata; diseño «e2e») — landmarks únicos,
// enlace de salto, cabecera estática, atribución visible, títulos e iconos sobre
// el servidor de producción. Las reglas axe de regiones se verifican aquí, no con
// etiquetas best-practice en `AXE_TAGS` (decisión 138 mantiene axe solo con wcag).
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

// El diseño es el mismo en claro y en oscuro: basta con los tres anchos en claro.
const LIGHT_PROJECTS = ['w320-light', 'w768-light', 'w1280-light'];
const ONLY_PROJECT = 'w1280-light';

const IGN_SENTENCE =
  'Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información Geográfica (CNIG), bajo licencia CC-BY 4.0.';

test.describe('estructura de la página', () => {
  test.beforeEach(() => {
    test.skip(
      !LIGHT_PROJECTS.includes(test.info().project.name),
      'el diseño no depende del esquema'
    );
  });

  for (const route of ROUTES) {
    test.describe(route.name, () => {
      test('landmarks únicos, un h1 y destino del enlace de salto', async ({ page }) => {
        await openRoute(page, route);

        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.getByRole('banner')).toHaveCount(1);
        await expect(page.getByRole('contentinfo')).toHaveCount(1);
        // D.18 (decisión 223): la cabecera ya no lleva `<nav>`; no queda ningún landmark de navegación.
        await expect(page.getByRole('navigation')).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.locator('#contenido')).toHaveCount(1);
      });

      test('sin desbordamiento horizontal', async ({ page }) => {
        await openRoute(page, route);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });

      test('el pie es visible y contiene la atribución IGN/CNIG literal', async ({ page }) => {
        await openRoute(page, route);
        const footer = page.getByRole('contentinfo');
        await expect(footer).toBeVisible();
        const text = (await footer.textContent()) ?? '';
        expect(text.replace(/\s+/g, ' ')).toContain(IGN_SENTENCE);
      });

      test('el enlace de salto es el primer Tab y Enter lleva a #contenido', async ({ page }) => {
        await openRoute(page, route);
        const skipLink = page.getByRole('link', { name: 'Saltar al contenido' });
        const inViewport = (): Promise<boolean> =>
          skipLink.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth
            );
          });

        expect(await inViewport()).toBe(false);
        await page.keyboard.press('Tab');
        await expect(skipLink).toBeFocused();
        expect(await inViewport()).toBe(true);

        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('contenido');
      });

      test('la cabecera no es sticky y alberga el selector de tema', async ({ page }) => {
        await openRoute(page, route);
        await page.evaluate(() => {
          window.scrollTo(0, 2000);
        });
        const position = await page
          .getByRole('banner')
          .evaluate((element) => getComputedStyle(element).position);
        expect(position).toBe('static');

        const banner = page.getByRole('banner');
        await expect(banner.getByRole('group', { name: 'Tema' }).getByRole('button')).toHaveCount(
          3
        );
        await expect(page.getByRole('contentinfo').getByRole('button')).toHaveCount(0);
      });
    });
  }
});

// D.18 (decisión 223) — a 320 px la cabecera cabe en una fila: el nombre y los tres botones de
// tema comparten el centro vertical (±1px) y cada botón mide al menos 40 × 40.
test.describe('cabecera de una fila (D.18)', () => {
  test('a 320 px el nombre y los tres botones de tema están en la misma fila y miden 40 × 40', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto('/no-existe');

    const banner = page.getByRole('banner');
    const brand = banner.getByRole('link', { name: 'Buscahogar' });
    const buttons = banner.getByRole('group', { name: 'Tema' }).getByRole('button');
    await expect(buttons).toHaveCount(3);

    const brandBox = await brand.boundingBox();
    expect(brandBox).not.toBeNull();
    const centreOf = (box: { y: number; height: number }): number => box.y + box.height / 2;
    for (let index = 0; index < 3; index += 1) {
      const box = await buttons.nth(index).boundingBox();
      expect(box, `botón ${String(index)}`).not.toBeNull();
      if (box === null || brandBox === null) continue;
      expect(Math.abs(centreOf(box) - centreOf(brandBox))).toBeLessThanOrEqual(1);
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    // Una sola fila: el alto de la cabecera es el del objetivo más alto más su relleno.
    const bannerBox = await banner.boundingBox();
    expect(bannerBox?.height ?? 0).toBeLessThan(72);
  });
});

test.describe('títulos e iconos', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== ONLY_PROJECT, 'una sola ejecución basta');
  });

  test('la home usa el título por defecto y la ficha lleva la plantilla', async ({ page }) => {
    const [home, detail] = ROUTES.filter((route) => ['home', 'detail'].includes(route.name));
    if (home === undefined || detail === undefined) throw new Error('faltan rutas');

    await openRoute(page, home);
    const homeTitle = await page.title();
    expect(homeTitle).toBe('Buscahogar');

    await openRoute(page, detail);
    const detailTitle = await page.title();
    expect(detailTitle).toMatch(/ · Buscahogar$/);
    expect(detailTitle).not.toBe(homeTitle);
  });

  test('los iconos del HTML construido responden 200 con su tipo y el apple-icon es opaco', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const iconHref = await page.locator('link[rel="icon"]').first().getAttribute('href');
    const appleHref = await page
      .locator('link[rel="apple-touch-icon"]')
      .first()
      .getAttribute('href');
    if (iconHref === null || appleHref === null) throw new Error('faltan los <link> de iconos');

    const iconUrl = new URL(iconHref, page.url());
    const appleUrl = new URL(appleHref, page.url());
    expect(iconUrl.pathname).toMatch(/^\/icon(\.svg)?$/);
    expect(appleUrl.pathname).toMatch(/^\/apple-icon(\.png)?$/);

    // Forma real servida por esta versión de Next/Turbopack (decisión 149).
    console.log(`icon href: ${iconHref} | apple-touch-icon href: ${appleHref}`);

    const icon = await request.get(iconUrl.toString());
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toContain('image/svg+xml');

    const apple = await request.get(appleUrl.toString());
    expect(apple.status()).toBe(200);
    expect(apple.headers()['content-type']).toContain('image/png');

    // Se dibuja en un canvas: cada píxel debe tener alfa 255 (sin transparencia).
    const minAlpha = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('sin contexto 2d');
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let min = 255;
      for (let index = 3; index < data.length; index += 4) {
        min = Math.min(min, data[index] ?? 0);
      }
      return min;
    }, appleUrl.toString());
    expect(minAlpha).toBe(255);
  });
});

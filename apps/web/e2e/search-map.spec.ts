// Paso D.8a (spec search-map-view SMV-16, SMV-18, SMV-20; decisión 164) — lista y mapa
// juntos sobre el servidor de producción: reparto por ancho, ruta de teclado de los
// marcadores y reencuadre al pasar de la vista de lista a 64rem. Los baselines visuales
// los cubre `visual.spec.ts`; aquí van las comprobaciones de comportamiento.
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const MAX_TABS = 120;

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

function onlyProject(name: string): void {
  test.skip(test.info().project.name !== name, `solo ${name}`);
}

test.describe('sin desbordamiento horizontal en ningún ancho (SMV-16)', () => {
  for (const name of ['home', 'map', 'home-filtered']) {
    test(`${name} no desborda`, async ({ page }) => {
      await openRoute(page, route(name));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('ruta de teclado a 1280px (SMV-20)', () => {
  test.beforeEach(() => {
    onlyProject('w1280-light');
  });

  test('Tab llega a un marcador, Intro abre el popup y Tab llega a «Ver vivienda»', async ({
    page,
  }) => {
    await openRoute(page, route('map'));
    // El conmutador sobra desde 64rem: no se ve y no está en el árbol de accesibilidad.
    await expect(page.locator('.view-toggle')).toBeHidden();

    const onMarker = (): Promise<boolean> =>
      page.evaluate(() => {
        const active = document.activeElement;
        return (
          active instanceof HTMLElement &&
          active.matches('.leaflet-marker-icon[title^="Vivienda, "]')
        );
      });
    for (let tab = 0; tab < MAX_TABS && !(await onMarker()); tab += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await onMarker()).toBe(true);
    await expect(page.locator(':focus')).toHaveAttribute('title', /^Vivienda, .+\. Ver detalle$/);

    await page.keyboard.press('Enter');
    await expect(page.locator('.leaflet-popup.map-popup')).toBeVisible();

    const onLink = (): Promise<boolean> =>
      page.evaluate(() => document.activeElement?.matches('.map-popup__link') ?? false);
    for (let tab = 0; tab < MAX_TABS && !(await onLink()); tab += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await onLink()).toBe(true);
    await expect(page.locator(':focus')).toHaveAccessibleName('Ver vivienda');
    await expect(page.locator(':focus')).toHaveAttribute('href', /^\/properties\//);
  });

  test('lista y marco se ven juntos con `view=list` y con `view=map`', async ({ page }) => {
    for (const path of ['/?view=list', '/?view=map', '/']) {
      await page.goto(path);
      await expect(page.locator('.search-results__list')).toBeVisible();
      await expect(page.locator('.search-map__frame')).toBeVisible();
    }
  });
});

test.describe('mapa oculto a 320px en la vista de lista (SMV-16)', () => {
  test.beforeEach(() => {
    onlyProject('w320-light');
  });

  test('el marco no se ve, «Ver mapa» sí y el foco nunca entra en el mapa', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator('.search-map__frame')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Ver mapa' })).toBeVisible();

    for (let tab = 0; tab < MAX_TABS; tab += 1) {
      await page.keyboard.press('Tab');
      const insideMap = await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.closest('.search-results__map') !== null;
      });
      expect(insideMap).toBe(false);
    }
  });

  test('en `view=map` se ve el marco, no la lista y el enlace dice «Ver lista»', async ({
    page,
  }) => {
    await openRoute(page, route('map'));
    await expect(page.locator('.search-map__frame')).toBeVisible();
    await expect(page.locator('.search-results__list')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Ver lista' })).toBeVisible();
  });
});

test.describe('cruce de 64rem sin recargar (SMV-16)', () => {
  test.beforeEach(() => {
    onlyProject('w768-light');
  });

  test('el mapa montado oculto se reencuadra al ensancharse: marcadores dentro del marco', async ({
    page,
  }) => {
    await openRoute(page, route('home'));
    const frame = page.locator('.search-map__frame');
    await expect(frame).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(frame).toBeVisible();
    await expect(frame.locator('.leaflet-marker-icon').first()).toBeVisible();
    await expect(frame.locator('.leaflet-tile-loaded').first()).toBeAttached();

    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    const markers = frame.locator('.leaflet-marker-icon');
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const markerBox = await markers.nth(index).boundingBox();
      expect(markerBox).not.toBeNull();
      if (box === null || markerBox === null) continue;
      expect(markerBox.x).toBeGreaterThanOrEqual(box.x);
      expect(markerBox.y).toBeGreaterThanOrEqual(box.y);
      expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(box.x + box.width);
      expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });
});

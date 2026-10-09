// Paso D.8a (spec search-map-view SMV-16, SMV-18, SMV-20; decisión 164) — lista y mapa
// juntos sobre el servidor de producción: reparto por ancho, ruta de teclado de los
// marcadores y reencuadre al pasar de la vista de lista a 64rem. Los baselines visuales
// los cubre `visual.spec.ts`; aquí van las comprobaciones de comportamiento y, desde D.8b,
// las del dibujo por teclado y su captura.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { AXE_TAGS } from './axe-baseline';
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

// D.13b (decisión 185) — los controles de Leaflet usan el conjunto de iconos dibujados. Antes del
// paso el zoom llevaba los glifos «+» y «−» y el cierre del popup un «×» en un <span>, así que estas
// comprobaciones (svg dentro, ningún glifo como texto) habrían fallado contra ese marcado.
test.describe('iconos dibujados en los controles del mapa (D.13b)', () => {
  test.beforeEach(() => {
    onlyProject('w1280-light');
  });

  test('el zoom lleva svg y ningún glifo +/−, y sigue funcionando', async ({ page }) => {
    await openRoute(page, route('map'));
    const zoomIn = page.getByRole('button', { name: 'Acercar' });
    const zoomOut = page.getByRole('button', { name: 'Alejar' });
    for (const control of [zoomIn, zoomOut]) {
      await expect(control.locator('svg.icon')).toHaveCount(1);
      await expect(control.locator('svg.icon')).toHaveAttribute('aria-hidden', 'true');
      expect(((await control.textContent()) ?? '').trim()).toBe('');
    }
    const zoomLevel = (): Promise<number> =>
      page.evaluate(() => {
        const tile = document.querySelector('.leaflet-tile-loaded');
        return Number(tile?.getAttribute('src')?.split('/').at(-3));
      });
    const before = await zoomLevel();
    await zoomIn.click();
    await expect.poll(zoomLevel).toBeGreaterThan(before);
  });

  test('el cierre del popup lleva svg, se llama «Cerrar», cierra y lo conserva al reabrir', async ({
    page,
  }) => {
    await openRoute(page, route('map'));
    const markers = page.locator('.leaflet-marker-icon[title^="Vivienda, "]');
    const popup = page.locator('.leaflet-popup.map-popup');
    expect(await markers.count()).toBeGreaterThan(1);

    for (const index of [0, 1]) {
      await markers.nth(index).focus();
      await page.keyboard.press('Enter');
      await expect(popup).toBeVisible();
      const close = popup.getByRole('button', { name: 'Cerrar' });
      await expect(close.locator('svg.icon')).toHaveCount(1);
      await expect(close.locator('svg.icon')).toHaveAttribute('aria-hidden', 'true');
      expect(((await close.textContent()) ?? '').trim()).toBe('');
      await close.click();
      await expect(popup).toHaveCount(0);
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

// ---------------------------------------------------------------------------------------
// Paso D.8b (spec search-map-view SMV-22', SMV-23 a SMV-26; decisiones 168-170) — dibujo por
// teclado.
// ---------------------------------------------------------------------------------------

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('el elemento no tiene caja');
  return box;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// B7 (puerta de consola): el anfitrión de la barra se antepone a un marco que pinta el
// servidor; una reconciliación o una hidratación fallida de React se vería aquí.
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

async function openMapView(page: Page): Promise<void> {
  await openRoute(page, route('map'));
  await expect(page.locator('.map-draw-toolbar')).toBeVisible();
}

const container = (page: Page): Locator => page.locator('.search-map__frame .leaflet-container');
const status = (page: Page): Locator => page.locator('.map-draw-toolbar p[role="status"]');
const vertices = (page: Page): Locator => page.locator('path.map-draw-vertex');
const button = (page: Page, name: string): Locator =>
  page.locator('.map-draw-toolbar').getByRole('button', { name, exact: true });

async function startDrawing(page: Page): Promise<void> {
  await button(page, 'Dibujar zona').click();
  await expect(container(page)).toBeFocused();
  await expect(status(page)).toHaveText(/^Dibujo iniciado/);
}

async function panDone(page: Page): Promise<void> {
  await expect(page.locator('.leaflet-pan-anim')).toHaveCount(0);
}

// Tres vértices no alineados con el teclado: Intro, flecha, Intro, flecha, Intro.
async function drawTriangle(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await panDone(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await panDone(page);
  await page.keyboard.press('Enter');
  await expect(vertices(page)).toHaveCount(3);
}

test.describe("dibujo por teclado (SMV-22', SMV-23 a SMV-25)", () => {
  test('dibujar y cerrar solo con teclado, sin avisos de consola (B7)', async ({ page }) => {
    const problems = watchConsole(page);
    await openMapView(page);
    await startDrawing(page);
    await drawTriangle(page);
    await expect(status(page)).toHaveText('Vértice añadido. Llevas 3 vértices.');

    // Mayús+Tab desde el mapa llega a la barra, que lo precede en el orden de foco.
    let reached = false;
    for (let tab = 0; tab < 6 && !reached; tab += 1) {
      await page.keyboard.press('Shift+Tab');
      reached = await button(page, 'Cerrar').evaluate((node) => node === document.activeElement);
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/polygon=/);
    // El foco vuelve a «Dibujar zona» una vez navegado (SMV-25).
    await expect(button(page, 'Dibujar zona')).toBeFocused();
    await expect(button(page, 'Quitar zona')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('Retroceso deshace y Escape cancela sin tocar la URL; el foco vuelve al botón', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openMapView(page);
    const url = page.url();
    await startDrawing(page);
    await drawTriangle(page);

    await page.keyboard.press('Backspace');
    await expect(vertices(page)).toHaveCount(2);
    await expect(status(page)).toHaveText('Último vértice eliminado. Quedan 2 vértices.');

    await page.keyboard.press('Escape');
    await expect(vertices(page)).toHaveCount(0);
    await expect(status(page)).toHaveText('Dibujo cancelado.');
    await expect(button(page, 'Dibujar zona')).toBeFocused();
    expect(page.url()).toBe(url);
    // Un solo nodo de estado en todos los estados (B9), con el mensaje caduco hasta el siguiente inicio.
    await expect(status(page)).toHaveCount(1);
    await startDrawing(page);
    await expect(status(page)).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('Intro mueve el vértice a la mira: centro del vértice y de la mira a 2 px', async ({
    page,
  }) => {
    await openMapView(page);
    await startDrawing(page);
    await page.keyboard.press('Enter');
    await expect(vertices(page)).toHaveCount(1);
    const vertex = await boxOf(vertices(page).first());
    const crosshair = await boxOf(page.locator('.map-draw-crosshair'));
    expect(
      Math.abs(vertex.x + vertex.width / 2 - (crosshair.x + crosshair.width / 2))
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(vertex.y + vertex.height / 2 - (crosshair.y + crosshair.height / 2))
    ).toBeLessThanOrEqual(2);
  });

  test('«Añadir vértice» añade; el segundo en el mismo punto se rechaza (B4)', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await button(page, 'Añadir vértice').click();
    await expect(status(page)).toHaveText('Vértice añadido. Llevas 1 vértice.');
    await button(page, 'Añadir vértice').click();
    await expect(vertices(page)).toHaveCount(1);
    await expect(status(page)).toHaveText(/^Ese punto ya es el último vértice/);
  });

  test('la mira es inerte y un clic sin arrastrar añade un vértice', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await page.locator('.map-draw-crosshair').scrollIntoViewIfNeeded();
    const crosshair = await boxOf(page.locator('.map-draw-crosshair'));
    const cx = crosshair.x + crosshair.width / 2;
    const cy = crosshair.y + crosshair.height / 2;
    // La mira no recibe eventos: lo que hay bajo su centro no es ella.
    const underCrosshair = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('.map-draw-crosshair') != null,
      [cx, cy]
    );
    expect(underCrosshair).toBe(false);
    // Un marcador puede quedar justo bajo el centro: se busca un punto libre cercano.
    let freePoint: readonly [number, number] | null = null;
    for (const [dx, dy] of [
      [0, 0],
      [0, 60],
      [60, 0],
      [-60, 0],
      [0, -60],
      [90, 90],
    ] as const) {
      const hit = await page.evaluate(
        ([x, y]) => {
          const element = document.elementFromPoint(x ?? 0, y ?? 0);
          return (
            element !== null && element.closest('.leaflet-marker-icon, .leaflet-control') === null
          );
        },
        [cx + dx, cy + dy]
      );
      if (hit) {
        freePoint = [cx + dx, cy + dy];
        break;
      }
    }
    expect(freePoint).not.toBeNull();
    if (freePoint === null) return;
    await page.mouse.click(freePoint[0], freePoint[1]);
    await expect(vertices(page)).toHaveCount(1);
    await expect(status(page)).toHaveText('Vértice añadido. Llevas 1 vértice.');
  });

  test('perder el foco no descarta los vértices', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await drawTriangle(page);
    await button(page, 'Deshacer').focus();
    await expect(vertices(page)).toHaveCount(3);
    await expect(button(page, 'Cerrar')).toBeVisible();
  });

  test('Escape con la ventana abierta la cierra y el dibujo sigue (SMV-23)', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await page.keyboard.press('Enter');
    await expect(vertices(page)).toHaveCount(1);

    await page.locator('.leaflet-marker-icon[title^="Vivienda, "]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.leaflet-popup.map-popup')).toBeVisible();
    // El marcador no cambia el borrador.
    await expect(vertices(page)).toHaveCount(1);
    await expect(status(page)).toHaveText('Vértice añadido. Llevas 1 vértice.');

    await container(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.leaflet-popup.map-popup')).toHaveCount(0);
    await expect(button(page, 'Cancelar')).toBeVisible();
    await expect(vertices(page)).toHaveCount(1);

    // Con la ventana ya cerrada, el siguiente Escape sí cancela.
    await page.keyboard.press('Escape');
    await expect(status(page)).toHaveText('Dibujo cancelado.');
  });

  test('Intro y Retroceso en el enlace de la ventana no tocan el borrador', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await page.keyboard.press('Enter');
    await page.locator('.leaflet-marker-icon[title^="Vivienda, "]').first().focus();
    await page.keyboard.press('Enter');
    const link = page.locator('.map-popup__link');
    await expect(link).toBeVisible();
    // Sin navegar: se cancela el clic del enlace para poder comprobar el borrador.
    await link.evaluate((node) => {
      node.addEventListener('click', (event) => {
        event.preventDefault();
      });
    });
    await link.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await expect(vertices(page)).toHaveCount(1);
    await expect(status(page)).toHaveText('Vértice añadido. Llevas 1 vértice.');
    await expect(button(page, 'Cancelar')).toBeVisible();
  });

  test('Tab desde el mapa llega al siguiente elemento enfocable fuera de él', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    let outside = false;
    for (let tab = 0; tab < MAX_TABS && !outside; tab += 1) {
      await page.keyboard.press('Tab');
      outside = await page.evaluate(() => {
        const active = document.activeElement;
        return (
          active instanceof HTMLElement &&
          active !== document.body &&
          active.closest('.leaflet-container') === null
        );
      });
    }
    expect(outside).toBe(true);
  });
});

test.describe('atribución en español (D.15, F7, WCAG 3.1.2)', () => {
  test.beforeEach(() => {
    onlyProject('w1280-light');
  });

  test('el control de atribución no lleva `title` ni texto en inglés', async ({ page }) => {
    await openRoute(page, route('map'));
    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toBeVisible();
    await expect(attribution.locator('[title]')).toHaveCount(0);
    await expect(attribution).not.toContainText('JavaScript library');
    // El crédito de OpenStreetMap (ODbL) sigue visible.
    await expect(attribution).toContainText('OpenStreetMap');
  });
});

test.describe('barra y mira (SMV-26, WCAG 2.5.8)', () => {
  test('botones de al menos 24 px, también durante el dibujo', async ({ page }) => {
    await openMapView(page);
    const check = async (): Promise<void> => {
      const buttons = page.locator('.map-draw-toolbar button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const box = await boxOf(buttons.nth(index));
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
    };
    await check();
    await startDrawing(page);
    await check();
  });

  test('la mira no se solapa con la barra ni con la atribución', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    const crosshair = await boxOf(page.locator('.map-draw-crosshair'));
    expect(intersects(crosshair, await boxOf(page.locator('.map-draw-toolbar')))).toBe(false);
    expect(intersects(crosshair, await boxOf(page.locator('.leaflet-control-attribution')))).toBe(
      false
    );
  });

  test('axe (wcag22aa) sin violaciones en la barra mientras se dibuja', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await page.keyboard.press('Enter');
    const results = await new AxeBuilder({ page })
      .include('.map-draw-toolbar')
      .withTags([...AXE_TAGS])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('captura del marco mientras se dibuja', async ({ page }) => {
    await openMapView(page);
    await startDrawing(page);
    await drawTriangle(page);
    await expect(page.locator('.search-map__frame')).toHaveScreenshot('draw-frame.png', {
      animations: 'disabled',
    });
  });
});

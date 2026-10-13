// Paso D.16 (specs motion-tokens, ui-motion-surfaces y map-motion; decisiones 205-208) — prueba de
// movimiento en Chromium SIN capturas. La configuración global fuerza `reducedMotion: 'reduce'`
// (sirve a los baselines visuales), así que cada bloque fija el valor que necesita. Todos los
// proyectos son Chromium y los dos anchos relevantes (320 y 1280 en claro) se eligen con
// `onlyProject`. Se leen estilos calculados y estados finales con `expect.poll`; nunca
// `getAnimations()` sobre `::details-content` (no expone esas transiciones) ni esperas fijas.
import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';
import { traySummary } from './tray';

function onlyProject(name: string): void {
  test.skip(test.info().project.name !== name, `solo ${name}`);
}

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

const SCALE_PRESSED = 'matrix(0.97, 0, 0, 0.97, 0, 0)';
const TRAY_PROPERTIES = 'opacity, transform, content-visibility';
const FILTERED_PATH = '/?operation=sale&maxPrice=300000';

const trayContent = (page: Page): Locator => page.locator('details.filter-tray');
const drawButton = (page: Page): Locator =>
  page.locator('.map-draw-toolbar').getByRole('button', { name: 'Dibujar zona', exact: true });

// Estilo calculado de una propiedad sobre `::details-content` de la bandeja.
async function pseudoStyle(
  page: Page,
  property: 'opacity' | 'transform' | 'transitionDuration' | 'transitionProperty'
): Promise<string> {
  return trayContent(page).evaluate(
    (element, name) => window.getComputedStyle(element, '::details-content')[name],
    property
  );
}

// El build minimiza los tiempos (`100ms` llega como `.1s`), así que se comparan como milisegundos.
async function rootTokenMs(page: Page, name: string): Promise<number> {
  const raw = await page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name
  );
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) throw new Error(`el token ${name} no es un tiempo: «${raw}»`);
  return raw.endsWith('ms') ? value : value * 1000;
}

async function computed(
  locator: Locator,
  property: 'transform' | 'transitionDuration' | 'transitionProperty'
): Promise<string> {
  return locator.evaluate((element, name) => window.getComputedStyle(element)[name], property);
}

// Pulsa con el ratón sobre el centro del elemento y lo deja pulsado.
async function pressWithMouse(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error('el elemento no tiene caja');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

// Suelta FUERA del elemento: no hay «click», así que no se navega ni se envía el formulario.
async function releaseOffTarget(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
  await page.mouse.up();
}

test.describe('movimiento con preferencia normal', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('bandeja a 320px: cerrada es transparente, abre con la entrada de 250 ms (S-MT-6, S-UM-3)', async ({
    page,
  }) => {
    onlyProject('w320-light');
    await openRoute(page, route('home'));

    expect(await rootTokenMs(page, '--duration-feedback')).toBe(100);
    expect(await rootTokenMs(page, '--duration-panel-enter')).toBe(250);
    expect(await rootTokenMs(page, '--duration-panel-exit')).toBe(200);

    // Sondeo: si Chromium no resolviera `::details-content` en getComputedStyle, esto fallaría aquí.
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0.2s');
    expect(await pseudoStyle(page, 'transitionProperty')).toBe(TRAY_PROPERTIES);
    expect(await pseudoStyle(page, 'opacity')).toBe('0');

    await traySummary(page).click();
    await expect(trayContent(page)).toHaveAttribute('open', /.*/);
    await expect.poll(() => pseudoStyle(page, 'opacity')).toBe('1');
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0.25s');
    expect(await pseudoStyle(page, 'transform')).toBe('none');
  });

  test('bandeja a 1280px: siempre visible y sin transición (S-UM-2)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('home'));

    await expect(traySummary(page)).toBeHidden();
    expect(await pseudoStyle(page, 'opacity')).toBe('1');
    expect(await pseudoStyle(page, 'transform')).toBe('none');
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0s');
  });

  test('pulsar con el ratón escala el botón y al soltar vuelve (S-UM-5)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const button = drawButton(page);

    expect(await computed(button, 'transitionDuration')).toBe('0.1s');
    expect(await computed(button, 'transform')).toBe('none');

    await pressWithMouse(page, button);
    await expect.poll(() => computed(button, 'transform')).toBe(SCALE_PRESSED);

    await releaseOffTarget(page);
    await expect.poll(() => computed(button, 'transform')).toBe('none');
  });

  test('el chip y el resumen de la bandeja escalan igual (S-UM-6)', async ({ page }) => {
    onlyProject('w320-light');
    await page.goto(FILTERED_PATH);
    const chip = page.locator('.applied-filters__chip').first();
    await expect(chip).toBeVisible();

    for (const target of [chip, traySummary(page)]) {
      expect(await computed(target, 'transitionDuration')).toBe('0.1s');
      await pressWithMouse(page, target);
      await expect.poll(() => computed(target, 'transform')).toBe(SCALE_PRESSED);
      await releaseOffTarget(page);
      await expect.poll(() => computed(target, 'transform')).toBe('none');
    }
  });

  test('los botones del selector de tema no escalan ni llevan transición (S-UM-6, UM-10)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('home'));
    const theme = page.getByRole('banner').getByRole('button', { name: 'Claro', exact: true });

    await pressWithMouse(page, theme);
    await expect.poll(() => theme.evaluate((element) => element.matches(':active'))).toBe(true);
    expect(await computed(theme, 'transform')).toBe('none');
    expect(await computed(theme, 'transitionDuration')).toBe('0s');
    await releaseOffTarget(page);
  });

  test('con teclado, Espacio mantiene el botón pulsado pero sin escala (S-UM-5, UM-8)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const button = drawButton(page);

    // Una tecla previa fija la modalidad de teclado; después el foco programático es `:focus-visible`.
    await page.keyboard.press('Tab');
    await button.focus();
    expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true);

    await page.keyboard.down('Space');
    await expect.poll(() => button.evaluate((element) => element.matches(':active'))).toBe(true);
    expect(await computed(button, 'transform')).toBe('none');
  });

  test('el color y el fondo siguen siendo instantáneos al pasar el ratón (S-UM-7)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const button = drawButton(page);

    await button.hover();
    await expect(button).toBeVisible();
    const property = await computed(button, 'transitionProperty');
    expect(property).toBe('transform');
    expect(property).not.toMatch(/color|background|border|outline|all/);
  });

  test('el pan con flechas es instantáneo y no usa la animación de Leaflet (S-MM-7)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const container = page.locator('.search-map__frame .leaflet-container');
    await container.focus();
    await expect(container).toBeFocused();

    // Leaflet engancha su `keydown` en `document` al recibir el foco; este oyente se añade DESPUÉS,
    // así que corre en el mismo despacho, con el pan ya aplicado. Un pan animado seguiría en 0.
    await page.evaluate(() => {
      const pane = document.querySelector('.leaflet-map-pane');
      const frame = document.querySelector('.search-map__frame .leaflet-container');
      if (pane === null || frame === null) throw new Error('falta el mapa');
      const offset = (): number => new DOMMatrix(getComputedStyle(pane).transform).m41;
      const probe = window as unknown as { __before: number; __moved: number; __anim: boolean };
      probe.__before = offset();
      probe.__moved = Number.NaN;
      probe.__anim = false;
      new MutationObserver(() => {
        if (frame.classList.contains('leaflet-pan-anim')) probe.__anim = true;
      }).observe(frame, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('keydown', () => {
        probe.__moved = offset() - probe.__before;
        if (frame.classList.contains('leaflet-pan-anim')) probe.__anim = true;
      });
    });
    await page.keyboard.press('ArrowRight');

    // Se muestrea 300 ms dentro de la página (un pan animado dura 250 ms y marca la clase).
    await page.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 300)));
    const result = await page.evaluate(() => {
      const probe = window as unknown as { __moved: number; __anim: boolean };
      return { moved: probe.__moved, anim: probe.__anim };
    });
    expect(result.moved).toBe(-80);
    expect(result.anim).toBe(false);
    await expect(page.locator('.leaflet-pan-anim')).toHaveCount(0);
  });
});

test.describe('movimiento con reducción de movimiento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('los tres tiempos valen 0s y la bandeja es instantánea (S-MT-6, S-UM-4)', async ({ page }) => {
    onlyProject('w320-light');
    await openRoute(page, route('home'));

    expect(await rootTokenMs(page, '--duration-feedback')).toBe(0);
    expect(await rootTokenMs(page, '--duration-panel-enter')).toBe(0);
    expect(await rootTokenMs(page, '--duration-panel-exit')).toBe(0);
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0s');
    await traySummary(page).click();
    await expect.poll(() => pseudoStyle(page, 'opacity')).toBe('1');
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0s');
  });

  test('los botones pulsables tampoco esperan (S-UM-4)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    expect(await computed(drawButton(page), 'transitionDuration')).toBe('0s');
  });
});

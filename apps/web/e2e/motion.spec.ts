// Paso D.16 (specs motion-tokens, ui-motion-surfaces y map-motion; decisiones 205-208) y D.21 (specs
// ui-microinteractions y motion, decisiones 240-243) — prueba de movimiento en Chromium SIN capturas. La configuración global fuerza `reducedMotion: 'reduce'`
// (sirve a los baselines visuales), así que cada bloque fija el valor que necesita. Todos los
// proyectos son Chromium y los dos anchos relevantes (320 y 1280 en claro) se eligen con
// `onlyProject`. Se leen estilos calculados y estados finales con `expect.poll`; nunca
// `getAnimations()` sobre `::details-content` (no expone esas transiciones) ni esperas fijas.
import AxeBuilder from '@axe-core/playwright';
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
// D.21: la lista de duraciones de los botones empareja la pulsación (100 ms) con el color (150 ms).
const PRESS_AND_COLOUR = '0.1s, 0.15s, 0.15s';
const HOVER_TIME = '0.15s';
const SCALE_HOVER = 'matrix(1.03, 0, 0, 1.03, 0, 0)';
const LINK_HOVER_RECIPE = 'color-mix(in oklab, var(--accent), var(--ink) 12%)';
// Sin resultados en la página 2: la lista muestra «Ir a la primera página» y el paginador, «anterior».
const PAGINATION_PATH = '/?page=2';
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

// Estilo calculado por nombre CSS (`border-block-end-color`, `color`...). El navegador devuelve los
// colores ya resueltos, así que se comparan entre sí y nunca con un literal.
async function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => window.getComputedStyle(element).getPropertyValue(name), property);
}

// Color calculado de una expresión CSS evaluada en la página (con los tokens del tema vigente).
async function resolveColour(page: Page, expression: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const resolved = window.getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, expression);
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('el elemento no tiene caja');
  return box;
}

// La siembra no tiene filas con foto (las cinco son «Sin foto»), y la regla de la imagen solo mira la
// clase. Se añade a la primera fila una imagen sin `src` (no pide nada a la red) con las mismas clases y
// la misma geometría que `next/image` con `fill`, escrita por CSSOM porque la CSP veta el atributo style.
async function addThumbnail(page: Page): Promise<{ row: Locator; image: Locator; media: Locator }> {
  const row = page.locator('.result-row__link').first();
  const media = row.locator('.result-row__media');
  await media.evaluate((box) => {
    const image = document.createElement('img');
    image.className = 'result-row__img';
    image.alt = '';
    image.style.position = 'absolute';
    image.style.inset = '0';
    image.style.inlineSize = '100%';
    image.style.blockSize = '100%';
    box.append(image);
  });
  return { row, image: media.locator('.result-row__img'), media };
}

// Los dos esquemas del ancho de escritorio: el hover se comprueba en claro y en oscuro.
function onlyDesktop(): void {
  test.skip(!test.info().project.name.startsWith('w1280'), 'solo 1280 px');
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
    expect(await rootTokenMs(page, '--duration-hover')).toBe(150);
    expect(await rootTokenMs(page, '--duration-appear')).toBe(200);
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

  // D.22: la portada pliega la bandeja a todos los anchos; «siempre visible» vale en los resultados.
  test('bandeja a 1280px: siempre visible y sin transición (S-UM-2)', async ({ page }) => {
    onlyProject('w1280-light');
    await page.goto('/?operation=sale');
    await page.evaluate(() => document.fonts.ready);

    await expect(traySummary(page)).toBeHidden();
    expect(await pseudoStyle(page, 'opacity')).toBe('1');
    expect(await pseudoStyle(page, 'transform')).toBe('none');
    expect(await pseudoStyle(page, 'transitionDuration')).toBe('0s');
  });

  test('pulsar con el ratón escala el botón y al soltar vuelve (S-UM-5)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const button = drawButton(page);

    expect(await computed(button, 'transitionDuration')).toBe(PRESS_AND_COLOUR);
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
      expect(await computed(target, 'transitionDuration')).toBe(PRESS_AND_COLOUR);
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

  // S-UM-7 (reemplazada en D.21, decisión 240): el color del hover ya se acompaña de 150 ms; la
  // pulsación sigue en 100 ms y el anillo de foco (outline) nunca entra en la lista.
  test('el hover de un botón transiciona color y borde en 150 ms, sin outline ni sombra (S-UM-7)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    const button = drawButton(page);

    await button.hover();
    await expect(button).toBeVisible();
    const property = await computed(button, 'transitionProperty');
    expect(property).toBe('transform, background-color, border-color');
    expect(property).not.toMatch(/all|outline|box-shadow/);
    expect(await computed(button, 'transitionDuration')).toBe(PRESS_AND_COLOUR);
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

  test('las cinco duraciones valen 0s y la bandeja es instantánea (S-MT-6, S-UM-4)', async ({ page }) => {
    onlyProject('w320-light');
    await openRoute(page, route('home'));

    expect(await rootTokenMs(page, '--duration-feedback')).toBe(0);
    expect(await rootTokenMs(page, '--duration-hover')).toBe(0);
    expect(await rootTokenMs(page, '--duration-appear')).toBe(0);
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
    // Cada entrada de la lista (pulsación y color) vale 0s: ya nada espera.
    expect(await computed(drawButton(page), 'transitionDuration')).toBe('0s, 0s, 0s');
  });

  // D.21 (UI-3, C1; S-UI-7): con movimiento reducido la imagen NO se amplía (no es «se amplía en 0 s»:
  // la regla no existe). El tinte del fondo, en cambio, sí se aplica, y al instante.
  test('con movimiento reducido la imagen de la fila no se amplía y el fondo cambia al instante (S-UI-7)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await page.goto('/');
    const { row, image } = await addThumbnail(page);
    const rest = await style(row, 'background-color');

    await row.hover();
    await expect.poll(() => style(row, 'background-color')).not.toBe(rest);
    expect(await computed(image, 'transform')).toBe('none');
    expect(await computed(image, 'transitionDuration')).toBe('0s');
    expect(await rootTokenMs(page, '--duration-hover')).toBe(0);
  });
});

// D.21 (UI-1, UI-1b, UI-2; S-UI-2, S-UI-2c, S-UI-3): color y borde de los controles al pasar el
// puntero, y lo que queda instantáneo.
test.describe('hover y color con preferencia normal (D.21)', () => {
  test.use({ reducedMotion: 'no-preference' });

  // Cada entrada: página donde está el control, localizador, y una propiedad de color que debe figurar.
  const CONTROLS: ReadonlyArray<readonly [name: string, path: string, selector: string, property: RegExp, time: string]> = [
    ['chip', FILTERED_PATH, '.applied-filters__chip', /border-color/, HOVER_TIME],
    ['resumen nl-disclosure', '/', '.nl-disclosure > summary', /background-color/, HOVER_TIME],
    ['preset de ordenación', '/', '.sort-presets__link', /border-color/, HOVER_TIME],
    ['fila de resultado', '/', '.result-row__link', /background-color/, HOVER_TIME],
    ['enlace del paginador', PAGINATION_PATH, '.pagination__prev', /^color$/, HOVER_TIME],
  ];

  for (const [name, path, selector, property, time] of CONTROLS) {
    test(`${name}: transiciona color en 150 ms (S-UI-2)`, async ({ page }) => {
      onlyProject('w1280-light');
      await page.goto(path);
      const target = page.locator(selector).first();
      await expect(target).toBeVisible();
      expect(await computed(target, 'transitionProperty')).toMatch(property);
      expect(await computed(target, 'transitionDuration')).toContain(time);
    });
  }

  test('enlace de texto y paginador: el hover mezcla acento y tinta y no mueve la caja (S-UI-2c)', async ({
    page,
  }) => {
    onlyDesktop();
    await page.goto(PAGINATION_PATH);
    const expected = await resolveColour(page, LINK_HOVER_RECIPE);
    for (const link of [page.locator('.pagination__prev')]) {
      const rest = await style(link, 'color');
      const box = await boxOf(link);
      expect(expected, 'la receta difiere del color en reposo').not.toBe(rest);

      await link.hover();
      await expect.poll(() => style(link, 'color')).toBe(expected);
      expect(await boxOf(link)).toEqual(box);

      await page.mouse.move(2, 2);
      await expect.poll(() => style(link, 'color')).toBe(rest);
    }
  });

  test('ordenación: un preset no vigente muestra --rule-control, distinto del vigente (S-UI-2c)', async ({
    page,
  }) => {
    onlyDesktop();
    await page.goto('/');
    const selected = page.locator('.sort-presets__link[aria-current="true"]');
    const other = page.locator('.sort-presets__link:not([aria-current="true"])').first();
    await expect(selected).toHaveCount(1);
    const rest = await style(other, 'border-block-end-color');
    const box = await boxOf(other);
    const softer = await resolveColour(page, 'var(--rule-control)');
    const selectedBorder = await style(selected, 'border-block-end-color');
    expect(softer).not.toBe(rest);
    expect(softer).not.toBe(selectedBorder);

    await other.hover();
    await expect.poll(() => style(other, 'border-block-end-color')).toBe(softer);
    expect(await boxOf(other)).toEqual(box);
    // El vigente no cambia con el puntero sobre otro preset.
    expect(await style(selected, 'border-block-end-color')).toBe(selectedBorder);
  });

  test('campos y selector de tema no transicionan; el anillo de foco es instantáneo (S-UI-3)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('home'));
    const field = page.locator('input:not([type="hidden"])').first();
    const select = page.locator('select').first();
    const theme = page.getByRole('banner').getByRole('button', { name: 'Claro', exact: true });
    for (const target of [field, select, theme]) {
      expect(await computed(target, 'transitionDuration')).toBe('0s');
      expect(await computed(target, 'transitionProperty')).not.toMatch(/color|outline|box-shadow/);
    }

    // Foco de teclado en un control con transición de color: el anillo ya está entero en la primera
    // lectura y su propiedad no figura en la lista.
    await page.keyboard.press('Tab');
    const link = page.locator('.sort-presets__link').first();
    await link.focus();
    expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect(await style(link, 'outline-style')).toBe('solid');
    expect(await style(link, 'outline-width')).toBe('2px');
    expect(await computed(link, 'transitionProperty')).not.toMatch(/outline|box-shadow/);
  });
});

// D.21 (UI-3; S-UI-6): realce de la fila y ampliación de la imagen con puntero fino.
test.describe('realce de la fila con preferencia normal (D.21)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('el fondo de la fila se tiñe y la imagen se amplía 1,03 sin mover ninguna caja (S-UI-6)', async ({
    page,
  }) => {
    onlyDesktop();
    await page.goto('/');
    const { row, image, media } = await addThumbnail(page);
    expect(await computed(image, 'transitionProperty')).toBe('transform');
    expect(await computed(image, 'transitionDuration')).toBe(HOVER_TIME);

    // D.22: con la franja de la portada la primera fila queda bajo el pliegue y `hover()` desplazaría la
    // página; las cajas se miden ya a la vista para comparar la misma posición antes y después.
    await row.scrollIntoViewIfNeeded();
    const restBackground = await style(row, 'background-color');
    const rowBox = await boxOf(row);
    const mediaBox = await boxOf(media);
    const tint = await resolveColour(page, 'var(--surface-sunken)');
    expect(await computed(image, 'transform')).toBe('none');

    await row.hover();
    await expect.poll(() => computed(image, 'transform')).toBe(SCALE_HOVER);
    await expect.poll(() => style(row, 'background-color')).toBe(tint);
    expect(tint).not.toBe(restBackground);
    expect(await boxOf(row)).toEqual(rowBox);
    expect(await boxOf(media)).toEqual(mediaBox);

    await page.mouse.move(2, 2);
    await expect.poll(() => computed(image, 'transform')).toBe('none');
    await expect.poll(() => style(row, 'background-color')).toBe(restBackground);
  });
});

// D.21 (S-UI-2d): sin puntero fino no hay hover de color.
test.describe('hover sin puntero fino (D.21)', () => {
  test.use({ reducedMotion: 'no-preference', isMobile: true, hasTouch: true });

  test('un puntero táctil no aplica el hover de enlace ni el de ordenación (S-UI-2d)', async ({ page }) => {
    onlyProject('w320-light');
    await page.goto(PAGINATION_PATH);
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
    const link = page.locator('.pagination__prev');
    const rest = await style(link, 'color');
    await link.hover();
    expect(await style(link, 'color')).toBe(rest);

    await page.goto('/');
    const other = page.locator('.sort-presets__link:not([aria-current="true"])').first();
    const border = await style(other, 'border-block-end-color');
    await other.hover();
    expect(await style(other, 'border-block-end-color')).toBe(border);
  });

  test('un puntero táctil no tiñe la fila ni amplía la imagen, ni al pulsarla (S-UI-8)', async ({ page }) => {
    onlyProject('w320-light');
    await page.goto('/');
    const { row, image } = await addThumbnail(page);
    const rest = await style(row, 'background-color');

    await row.hover();
    expect(await style(row, 'background-color')).toBe(rest);
    expect(await computed(image, 'transform')).toBe('none');

    // Pulsada (:active) la imagen sigue sin ampliarse; se suelta fuera para no navegar.
    await pressWithMouse(page, row);
    await expect.poll(() => row.evaluate((element) => element.matches(':active'))).toBe(true);
    expect(await computed(image, 'transform')).toBe('none');
    await releaseOffTarget(page);
  });
});

// D.21 (UI-4..UI-6; S-UI-11, S-UI-12, S-UI-14, decisión 242): los avisos aparecen con un fundido de
// opacidad de 200 ms al montarse, nunca se quedan ocultos y las alertas no se animan.
const EMPTY_PATH = '/?operation=sale&maxPrice=1';

interface FadeRecord {
  readonly name: string;
  readonly className: string;
  readonly duration: number;
}

// Registra cada `animationstart` desde antes de cualquier script de la página: un fundido de 200 ms
// empieza y acaba demasiado rápido para leerlo después con `getAnimations()`.
async function recordFades(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const records: Array<{ name: string; className: string; duration: number }> = [];
    Object.defineProperty(window, '__fades', { value: records });
    document.addEventListener(
      'animationstart',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const timing = target.getAnimations()[0]?.effect?.getTiming();
        const duration = typeof timing?.duration === 'number' ? timing.duration : Number.NaN;
        records.push({ name: event.animationName, className: target.getAttribute('class') ?? '', duration });
      },
      true
    );
  });
}

async function fades(page: Page): Promise<FadeRecord[]> {
  return page.evaluate(() => (window as unknown as { __fades: FadeRecord[] }).__fades.slice());
}

test.describe('fundido de los avisos con preferencia normal (D.21)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('el aviso del vacío filtrado hace un fundido de 200 ms y acaba opaco (S-UI-11)', async ({ page }) => {
    onlyProject('w1280-light');
    await recordFades(page);
    await page.goto(EMPTY_PATH);
    const notice = page.locator('.empty-results');
    await expect(notice).toBeVisible();

    await expect
      .poll(async () => (await fades(page)).filter((record) => record.className.includes('empty-results')))
      .toEqual([{ name: 'notice-appear', className: 'empty-results', duration: 200 }]);
    await expect.poll(() => style(notice, 'opacity')).toBe('1');
    expect(await style(notice, 'visibility')).toBe('visible');
    expect(await style(notice, 'animation-fill-mode')).toBe('none');
  });

  test('el panel de cobertura en curso también aparece con el fundido (S-UI-11)', async ({ page }) => {
    onlyProject('w1280-light');
    await recordFades(page);
    await openRoute(page, route('coverage-running'));
    const panel = page.locator('.coverage-panel');
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => (await fades(page)).some((record) => record.className.includes('coverage-panel')))
      .toBe(true);
    await expect.poll(() => style(panel, 'opacity')).toBe('1');
  });

  // 4.3 (D.21, lectura e2e pedida por el diseño): el diseño suponía que `router.push` de la barra de
  // dibujo volvía a montar el subárbol de la página y repetía el fundido. La lectura dice lo contrario:
  // con Next 16.3.4 la navegación suave a la misma ruta con otros parámetros CONSERVA los nodos del DOM
  // (la marca puesta en la cabecera de la búsqueda sigue ahí), así que lo ya montado no repite su
  // fundido; solo lo que aparece de nuevo lo hace, una vez, y la carga completa lo repite. Sin ocultar
  // nada en ningún caso. Si una versión futura vuelve a montar, este test avisa.
  test('cerrar un polígono con router.push conserva el DOM de la página: no hay repetición del fundido (4.3)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    await page.evaluate(() => {
      const mark = (selector: string): void => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`falta ${selector}`);
        Object.defineProperty(element, '__mark', { value: true });
      };
      mark('.search-header');
      mark('body > header, header');
    });

    await drawButton(page).click();
    await expect(page.locator('.search-map__frame .leaflet-container')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.leaflet-pan-anim')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.leaflet-pan-anim')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('path.map-draw-vertex')).toHaveCount(3);
    await page.locator('.map-draw-toolbar').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page).toHaveURL(/polygon=/);
    await expect(page.locator('.map-draw-toolbar').getByRole('button', { name: 'Quitar zona' })).toBeVisible();

    // Todas las cabeceras que haya en el DOM (una navegación suave podría conservar la anterior
    // oculta): se anota cuáles llevan la marca y cuáles se ven.
    const headers = await page.locator('.search-header').evaluateAll((nodes) =>
      nodes.map((node) => ({
        marked: (node as unknown as { __mark?: boolean }).__mark === true,
        visible: node.getClientRects().length > 0,
      }))
    );
    const siteHeaderMarked = await page.evaluate(
      () => (document.querySelector('body > header, header') as unknown as { __mark?: boolean }).__mark === true
    );
    expect(siteHeaderMarked, 'el layout persiste a través de la navegación').toBe(true);
    expect(headers, 'una sola cabecera en el DOM, la misma de antes de navegar').toEqual([
      { marked: true, visible: true },
    ]);
  });

  test('las alertas no se animan ni se atenúan (S-UI-14)', async ({ page }) => {
    onlyProject('w1280-light');
    for (const [path, selector] of [
      ['/?q=', '#search-text-alert'],
      ['/?minPrice=abc', '[role="alert"]'],
    ] as const) {
      await page.goto(path);
      const alert = page.locator(selector).first();
      await expect(alert).toBeVisible();
      expect(await style(alert, 'animation-name'), path).toBe('none');
      expect(await style(alert, 'transition-property'), path).not.toMatch(/opacity/);
      expect(await style(alert, 'opacity'), path).toBe('1');
    }
  });
});

test.describe('fundido de los avisos con reducción de movimiento (D.21)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('el aviso está opaco desde la primera lectura y su animación dura 0 s (S-UI-12)', async ({ page }) => {
    onlyProject('w1280-light');
    await page.goto(EMPTY_PATH);
    const notice = page.locator('.empty-results');
    await expect(notice).toBeVisible();
    expect(await style(notice, 'opacity')).toBe('1');
    expect(await style(notice, 'visibility')).toBe('visible');
    expect(await style(notice, 'animation-duration')).toBe('0s');
  });
});

// D.22 (MS-1..MS-3, decisión 270): la entrada escalonada de la lista y el barrido del motivo de la
// portada. Se lee el estilo calculado (retardo, duración) y los `animationstart`; nunca esperas fijas.
const ROW_PATH = '/?operation=sale';
const ROWS = '.result-list > li';
const IDENTITY = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

// Añade copias de la última fila hasta que haya `count`: la siembra no llega a siete filas. Las copias
// reciben las mismas reglas por posición (nth-child), que es lo que se quiere leer.
async function padRows(page: Page, count: number): Promise<void> {
  await page.evaluate((wanted) => {
    const list = document.querySelector('.result-list');
    const rows = list?.querySelectorAll(':scope > li') ?? [];
    const last = rows[rows.length - 1];
    if (list === null || last === undefined) throw new Error('no hay filas que copiar');
    for (let index = rows.length; index < wanted; index += 1) list.append(last.cloneNode(true));
  }, count);
}

async function rowTimings(page: Page): Promise<Array<{ name: string; delay: number; duration: number }>> {
  return page.locator(ROWS).evaluateAll((rows) =>
    rows.map((row) => {
      const css = window.getComputedStyle(row);
      const ms = (value: string): number =>
        value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
      return { name: css.animationName, delay: ms(css.animationDelay), duration: ms(css.animationDuration) };
    })
  );
}

test.describe('entrada de la lista y barrido del motivo con preferencia normal (D.22)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('seis filas con retardo de 20 ms por posición, la séptima sin animar y todo acaba en 300 ms o menos (MS-2)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await page.goto(ROW_PATH);
    await expect(page.locator(ROWS).first()).toBeVisible();
    await padRows(page, 8);
    const timings = await rowTimings(page);
    expect(timings).toHaveLength(8);
    timings.slice(0, 6).forEach((timing, index) => {
      expect(timing.name, `fila ${String(index + 1)}`).toBe('row-enter');
      expect(timing.duration).toBe(200);
      expect(timing.delay).toBeCloseTo(index * 20, 5);
    });
    expect(timings[5]?.delay).toBeCloseTo(100, 5);
    for (const timing of timings.slice(6)) expect(timing.name).toBe('none');
    const end = Math.max(...timings.slice(0, 6).map((timing) => timing.delay + timing.duration));
    expect(end).toBeLessThanOrEqual(300);
  });

  test('cada carga repite la entrada de las filas y todas acaban opacas, enfocables y en el mismo orden (MS-2)', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await recordFades(page);
    await page.goto(ROW_PATH);
    const rows = page.locator(ROWS);
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    const links = rows.locator('a');
    const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    const expected = Math.min(total, 6);
    await expect
      .poll(async () => (await fades(page)).filter((record) => record.name === 'row-enter').length)
      .toBe(expected);
    await expect
      .poll(() => rows.evaluateAll((nodes) => nodes.map((node) => window.getComputedStyle(node).opacity)))
      .toEqual(Array.from({ length: total }, () => '1'));
    // Contenido intacto: mismo orden y la primera fila enlazable con teclado.
    expect(await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))).toEqual(hrefs);
    await links.first().focus();
    await expect(links.first()).toBeFocused();

    // Una nueva carga completa la repite.
    await page.reload();
    await expect(rows.first()).toBeVisible();
    await expect
      .poll(async () => (await fades(page)).filter((record) => record.name === 'row-enter').length)
      .toBe(expected);
  });

  test('axe no encuentra nada mientras las filas se animan (MS-2)', async ({ page }) => {
    onlyProject('w1280-light');
    await page.goto(ROW_PATH);
    await expect(page.locator(ROWS).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('el barrido del motivo existe solo en la portada: 250 ms, una vez, y acaba entero (MS-3)', async ({ page }) => {
    onlyProject('w1280-light');
    await recordFades(page);
    await page.goto('/');
    const fade = page.locator('.home-hero .contour-motif__fade');
    await expect(fade).toHaveCount(1);
    expect(await style(fade, 'animation-name')).toBe('contour-wipe');
    expect(await style(fade, 'animation-duration')).toBe('0.25s');
    expect(await style(fade, 'animation-iteration-count')).toBe('1');
    await expect
      .poll(async () => (await fades(page)).filter((record) => record.name === 'contour-wipe').length)
      .toBe(1);
    await expect.poll(() => fade.evaluate((node) => window.getComputedStyle(node).transform)).toMatch(IDENTITY);

    // Fuera de la portada el mismo motivo no se anima.
    await page.goto(ROW_PATH);
    const other = page.locator('.contour-motif__fade');
    if ((await other.count()) > 0) expect(await style(other.first(), 'animation-name')).toBe('none');
  });

  test('la chip y la acción de un estado responden a la pulsación en 100 ms (MS-1)', async ({ page }) => {
    onlyProject('w1280-light');
    await page.goto('/');
    const chip = page.locator('.example-searches__link').first();
    expect(await computed(chip, 'transitionProperty')).toBe('transform, background-color, border-color');
    expect(await computed(chip, 'transitionDuration')).toBe(PRESS_AND_COLOUR);
    await pressWithMouse(page, chip);
    await expect.poll(() => computed(chip, 'transform')).toBe(SCALE_PRESSED);
    await releaseOffTarget(page);

    await page.goto(EMPTY_PATH);
    const action = page.locator('.state-action').first();
    expect(await computed(action, 'transitionDuration')).toBe(PRESS_AND_COLOUR);
  });

  // W1 (tarea 4.7): `CoverageStatus` llama a `router.refresh()`. Las filas con clave se conservan y
  // las nuevas se animan una vez; en ningún caso queda una fila a opacidad menor que 1.
  test('tras un router.refresh() toda fila acaba opaca y visible (W1)', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('coverage-pending'));
    const rows = page.locator(ROWS);
    await expect(rows.first()).toBeVisible();
    await page.waitForResponse((response) => response.url().includes('_rsc'), { timeout: 20_000 });
    const total = await rows.count();
    await expect
      .poll(() =>
        rows.evaluateAll((nodes) =>
          nodes.map((node) => [window.getComputedStyle(node).opacity, window.getComputedStyle(node).visibility])
        )
      )
      .toEqual(Array.from({ length: total }, () => ['1', 'visible']));
  });
});

test.describe('entrada de la lista y barrido del motivo con reducción de movimiento (D.22, W2)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('las filas y el motivo tienen duración y retardo efectivos de 0 s y están opacos desde la primera lectura', async ({
    page,
  }) => {
    onlyProject('w1280-light');
    await page.goto('/');
    await expect(page.locator(ROWS).first()).toBeVisible();
    const rows = await page.locator(ROWS).evaluateAll((nodes) =>
      nodes.map((node) => {
        const css = window.getComputedStyle(node);
        return { duration: css.animationDuration, delay: css.animationDelay, opacity: css.opacity, transform: css.transform };
      })
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.duration).toBe('0s');
      expect(row.delay).toBe('0s');
      expect(row.opacity).toBe('1');
      expect(row.transform).toBe('none');
    }
    const fade = page.locator('.home-hero .contour-motif__fade');
    expect(await style(fade, 'animation-duration')).toBe('0s');
    expect(await fade.evaluate((node) => window.getComputedStyle(node).transform)).toMatch(IDENTITY);
  });
});

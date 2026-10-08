// Paso D.9 (decisiones 172, 173 y 175) — la ficha más allá de la captura: la galería se
// recorre sin JavaScript con las anclas de fragmento, y ningún elemento enfocable queda
// tapado por el resumen sticky ni por nada más (WCAG 2.4.11, F110), en los dos sentidos. Se
// usa la ficha de P7 (`detail-gallery`): la única con dos fotos.
import { E2E_NO_LOCATION_LISTING_ID } from '@buscahogar/db/e2e';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

// Tope del recorrido con Tab: la ficha tiene muchos menos enfocables. Llegar a él es un fallo.
const MAX_TABS = 80;

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

const GALLERY_ROUTE = route('detail-gallery');
const HISTORY_ROUTE = route('detail-history');
const SINGLE_ROUTE = route('detail-single');

// La diapositiva ocupa la caja visible de la tira (con medio píxel de tolerancia por redondeo).
async function fillsStrip(strip: Locator, slide: Locator): Promise<boolean> {
  const stripBox = await strip.boundingBox();
  const slideBox = await slide.boundingBox();
  if (stripBox === null || slideBox === null) return false;
  return (
    Math.abs(slideBox.x - stripBox.x) <= 0.5 &&
    Math.abs(slideBox.x + slideBox.width - (stripBox.x + stripBox.width)) <= 0.5
  );
}

test.describe('galería de la ficha sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('«Foto siguiente» y «Foto anterior» cambian el fragmento y desplazan la tira; nada avanza solo', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto(GALLERY_ROUTE.path);

    const gallery = page.getByRole('region', { name: 'Fotos de la vivienda' });
    await expect(gallery).toHaveAttribute('aria-roledescription', 'carrusel');
    // APG: un carrusel que no rota solo no anuncia cambios ni lleva control de pausa.
    await expect(gallery).not.toHaveAttribute('aria-live', /.*/);
    const slides = gallery.getByRole('group');
    await expect(slides).toHaveCount(2);
    await expect(slides.nth(0)).toHaveAccessibleName('Foto 1 de 2 · Idealista');
    await expect(slides.nth(1)).toHaveAccessibleName('Foto 2 de 2 · Kyero');
    const strip = gallery.locator('.snap-x');
    const firstId = await slides.nth(0).getAttribute('id');
    const secondId = await slides.nth(1).getAttribute('id');
    expect(firstId).not.toBeNull();
    expect(secondId).not.toBeNull();

    expect(await fillsStrip(strip, slides.nth(0))).toBe(true);
    expect(await fillsStrip(strip, slides.nth(1))).toBe(false);

    await slides.nth(0).getByRole('link', { name: 'Foto siguiente' }).click();
    await page.waitForURL((url) => url.hash === `#${secondId ?? ''}`);
    await expect.poll(() => fillsStrip(strip, slides.nth(1))).toBe(true);
    expect(await fillsStrip(strip, slides.nth(0))).toBe(false);

    // Nada avanza solo: sin JavaScript no hay temporizadores, y la tira no tiene
    // animaciones CSS. Dos capturas fuerzan fotogramas nuevos (sin esperas por tiempo)
    // y, tras ellas, la posición y el fragmento siguen donde los dejó el enlace.
    expect(await strip.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(
      0
    );
    const scrollLeft = await strip.evaluate((element) => element.scrollLeft);
    expect(scrollLeft).toBeGreaterThan(0);
    await strip.screenshot();
    await strip.screenshot();
    expect(await strip.evaluate((element) => element.scrollLeft)).toBe(scrollLeft);
    expect(new URL(page.url()).hash).toBe(`#${secondId ?? ''}`);
    expect(await fillsStrip(strip, slides.nth(1))).toBe(true);

    await slides.nth(1).getByRole('link', { name: 'Foto anterior' }).click();
    await page.waitForURL((url) => url.hash === `#${firstId ?? ''}`);
    await expect.poll(() => fillsStrip(strip, slides.nth(0))).toBe(true);
  });

  test('el enlace de vuelta es un href normal que funciona sin JavaScript', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto(GALLERY_ROUTE.path);

    const back = page.locator('.property-detail__back a');
    await expect(back).toHaveText('Volver a la búsqueda');
    await expect(back).toHaveAttribute('href', '/');
    await expect(back).not.toHaveAttribute('onclick', /.*/);

    await back.click();
    await page.waitForURL((url) => url.pathname === '/' && url.search === '' && url.hash === '');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('ul.result-list > li').first()).toBeVisible();
  });
});

// D.12 (decisión 180): la lista de anuncios de origen es una comparación. P4 tiene un único
// anuncio activo, P7 solo inactivos. La nota de agrupación se ve siempre; el aviso solo sin activos.
test.describe('comparación de anuncios de origen en la ficha', () => {
  test('P4, una sola fuente: una insignia «Más económico», la nota y ningún aviso', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto(SINGLE_ROUTE.path);

    const list = page.locator('.source-list');
    await expect(list.locator('.source-row')).toHaveCount(1);
    await expect(list.locator('.source-row__highlight')).toHaveCount(1);
    await expect(list.getByText('Más económico')).toHaveCount(1);
    await expect(list.getByText('Precio más bajo')).toHaveCount(0);
    await expect(list.locator('.source-list__note')).toContainText('Compruébalo en cada fuente');
    await expect(list.locator('.source-list__warning')).toHaveCount(0);
  });

  test('P7, sin anuncios activos: aviso y «Precio más bajo», nunca «Más económico»', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await page.goto(GALLERY_ROUTE.path);

    const list = page.locator('.source-list');
    await expect(list.locator('.source-list__warning')).toContainText(
      'Ninguno de estos anuncios sigue disponible'
    );
    await expect(list.getByText('Más económico')).toHaveCount(0);
    await expect(list.getByText('Precio más bajo')).toHaveCount(1);
    await expect(list.locator('.source-list__note')).toBeVisible();
  });

  test('a 320 px la lista no desborda en horizontal', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    for (const detailRoute of [SINGLE_ROUTE, GALLERY_ROUTE, HISTORY_ROUTE]) {
      await page.goto(detailRoute.path);
      const overflow = await page
        .locator('.source-list')
        .evaluate((list) => list.scrollWidth - list.clientWidth);
      expect(overflow, detailRoute.name).toBeLessThanOrEqual(0);
    }
  });
});

// D.11 (decisión 179): «Ubicación» sin JavaScript. P1 tiene coordenadas: cuatro teselas (las
// sirve `fixtures.ts` en local), aviso, atribución y ningún punto. P6 no las tiene, pero sí
// municipio: título y «Getafe», y ni una petición de teselas.
test.describe('ubicación aproximada de la ficha sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('P1: cuatro teselas, aviso, atribución y ningún punto', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    const tileRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'tile.openstreetmap.org') tileRequests.push(request.url());
    });
    await page.goto(HISTORY_ROUTE.path);

    const section = page.getByRole('region', { name: 'Ubicación' });
    const map = section.getByRole('img', { name: /círculo de unos 500 m de radio en Getafe/ });
    await expect(map).toBeVisible();
    await map.scrollIntoViewIfNeeded();
    const tiles = section.locator('.location-map img');
    await expect(tiles).toHaveCount(4);
    await expect
      .poll(() => tiles.evaluateAll((all) => all.every((tile) => (tile as HTMLImageElement).complete)))
      .toBe(true);
    expect(tileRequests).toHaveLength(4);
    for (const url of tileRequests) expect(url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png$/);
    await expect(section.getByText('Ubicación aproximada')).toBeVisible();
    await expect(section.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright'
    );
    // Ningún punto ni marca: solo el círculo del área (y su filete).
    await expect(section.locator('svg.location-map__overlay circle')).toHaveCount(2);
    await expect(section.locator('.location-map__area')).toHaveCount(1);
  });

  test('P6: sin ubicación, «Ubicación» y «Getafe», y cero peticiones de teselas', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    const tileRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'tile.openstreetmap.org') tileRequests.push(request.url());
    });
    await page.goto(`/properties/${E2E_NO_LOCATION_LISTING_ID}`);

    const section = page.getByRole('region', { name: 'Ubicación' });
    await expect(section.getByRole('heading', { name: 'Ubicación' })).toBeVisible();
    await expect(section.getByText('Getafe')).toBeVisible();
    await expect(section.locator('img, svg')).toHaveCount(0);
    await expect(page.getByText('Ubicación aproximada')).toHaveCount(0);
    expect(tileRequests).toEqual([]);
  });
});

interface FocusedElement {
  readonly label: string;
  readonly inPanel: boolean;
  // Ya se había enfocado antes en este recorrido: el Tab ha dado la vuelta.
  readonly revisited: boolean;
}

interface FocusStep {
  readonly label: string;
  readonly inPanel: boolean;
  // Con el foco aquí, la página llevaba este desplazamiento y el resumen de precio estaba a esta
  // distancia del borde superior (0 = pegado).
  readonly scrollY: number;
  readonly summaryTop: number | null;
}

// Marca el elemento enfocado como visitado y lo describe. `null` si el foco salió del documento.
function describeFocus(page: Page): Promise<FocusedElement | null> {
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & { e2eFocusWalk?: WeakSet<Element> };
    const visited = (scope.e2eFocusWalk ??= new WeakSet<Element>());
    const element = document.activeElement;
    if (element === null || element === document.body) return null;
    const revisited = visited.has(element);
    visited.add(element);
    const text = (element.getAttribute('aria-label') ?? element.textContent)
      .replace(/\s+/g, ' ')
      .trim();
    return {
      label: text === '' ? element.tagName.toLowerCase() : text,
      inPanel: element.closest('.property-detail__panel') !== null,
      revisited,
    };
  });
}

// Problemas de ocultación del elemento enfocado; vacío si se ve. Se repite con
// `expect.poll` hasta que el desplazamiento por el foco termina (sin esperas por tiempo).
// Lo que tapa el foco por arriba es el resumen sticky: el punto central del elemento tiene que
// pertenecer al propio elemento (F110), no al resumen ni a nada más.
function focusProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body)
      return ['el foco no está en ningún elemento'];
    const problems: string[] = [];
    // La primera caja de línea: un enlace partido en dos líneas tiene el centro entre ambas.
    const box = element.getClientRects().item(0) ?? element.getBoundingClientRect();
    const viewport = {
      left: 0,
      top: 0,
      right: document.documentElement.clientWidth,
      bottom: innerHeight,
    };
    const overlaps = (
      a: { left: number; top: number; right: number; bottom: number },
      b: typeof a
    ): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    if (box.width === 0 || box.height === 0) problems.push('caja vacía');
    if (!overlaps(box, viewport)) problems.push('fuera de la ventana');

    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit === null || (hit !== element && !element.contains(hit))) {
      const by =
        hit === null
          ? 'nada (fuera de la ventana)'
          : `${hit.tagName.toLowerCase()}.${hit.className}`;
      problems.push(`en su centro está ${by}`);
    }
    return problems;
  });
}

// Estado del desplazamiento y del resumen sticky en el instante del foco.
function stickyState(page: Page): Promise<{ scrollY: number; summaryTop: number | null }> {
  return page.evaluate(() => {
    const summary = document.querySelector('.property-summary--panel');
    const visible = summary !== null && getComputedStyle(summary).display !== 'none';
    return { scrollY, summaryTop: visible ? summary.getBoundingClientRect().top : null };
  });
}

// Recorre con una tecla (Tab hacia delante, Shift+Tab hacia atrás) TODOS los enfocables de la
// ficha y comprueba cada uno. Devuelve los pasos.
async function walkFocus(page: Page, key: 'Tab' | 'Shift+Tab'): Promise<readonly FocusStep[]> {
  const steps: FocusStep[] = [];
  for (let press = 0; press < MAX_TABS; press += 1) {
    await page.keyboard.press(key);
    const focused = await describeFocus(page);
    // Fin del recorrido: el foco sale del documento o vuelve a uno ya visitado.
    if (focused === null || focused.revisited) return steps;
    await expect
      .poll(() => focusProblems(page), {
        message: `foco tapado en «${focused.label}» (${key}, paso ${String(press + 1)})`,
      })
      .toEqual([]);
    steps.push({ label: focused.label, inPanel: focused.inPanel, ...(await stickyState(page)) });
  }
  throw new Error(`el recorrido con ${key} no terminó en ${String(MAX_TABS)} pasos`);
}

const FOCUS_CASES = [
  { project: 'w1280-light', viewport: null, name: '1280 de ancho' },
  // A 480 de alto el precio sticky ocupa una parte grande de la ventana: es el caso que más
  // expone un foco tapado.
  { project: 'w1280-light', viewport: { width: 1280, height: 480 }, name: '1280×480' },
  { project: 'w320-light', viewport: null, name: '320 de ancho' },
] as const;

const EXPECTED_LABELS = [
  'Saltar al contenido',
  'Volver a la búsqueda',
  'Foto siguiente',
  'Foto anterior',
  'Ver en Idealista (web externa)',
  'Ver en Kyero (web externa)',
];

test.describe('ficha: el foco nunca queda tapado (WCAG 2.4.11, F110)', () => {
  for (const focusCase of FOCUS_CASES) {
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      test(`${key} por todos los enfocables, a ${focusCase.name}`, async ({ page }) => {
        test.skip(test.info().project.name !== focusCase.project, `solo ${focusCase.project}`);
        if (focusCase.viewport !== null) await page.setViewportSize(focusCase.viewport);
        await openRoute(page, GALLERY_ROUTE);

        const steps = await walkFocus(page, key);
        const labels = steps.map((step) => step.label);
        for (const expected of EXPECTED_LABELS) expect(labels).toContain(expected);
        expect(steps.filter((step) => step.inPanel).length).toBeGreaterThanOrEqual(2);
        // En ancho, con el foco en los datos del panel la página se ha desplazado y el precio
        // sigue pegado arriba: sin ese anclaje la comprobación anterior no probaría nada.
        if (focusCase.viewport !== null) {
          const pinned = steps.filter(
            (step) => step.inPanel && step.scrollY > 0 && step.summaryTop !== null
          );
          expect(pinned.length).toBeGreaterThan(0);
          for (const step of pinned) expect(Math.abs(step.summaryTop ?? NaN)).toBeLessThanOrEqual(0.5);
        }
      });
    }
  }
});

// D.13b (decisión 183): solo el precio es sticky y el panel ya no tiene caja ni desplazamiento propio.
test.describe('ficha: el precio es lo único fijo', () => {
  test('1280: resumen sticky, panel sin overflow ni caja, y las fuentes se alcanzan con la página', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w1280-light', 'solo el ancho de escritorio');
    await openRoute(page, GALLERY_ROUTE);

    const summary = page.locator('.property-summary--panel');
    const panel = page.locator('.property-detail__panel');
    await expect(summary).toHaveCSS('position', 'sticky');
    await expect(panel).toHaveCSS('position', 'static');
    await expect(panel).toHaveCSS('overflow-y', 'visible');
    await expect(panel).toHaveCSS('border-top-width', '0px');
    const noInnerScroll = await panel.evaluate((el) => el.scrollHeight <= el.clientHeight);
    expect(noInnerScroll).toBe(true);

    await page.locator('.source-list').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => summary.evaluate((el) => Math.abs(el.getBoundingClientRect().top)))
      .toBeLessThanOrEqual(0.5);
    await expect(page.getByRole('link', { name: 'Ver en Kyero (web externa)' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('↗');
  });

  test('320: nada es sticky', async ({ page }) => {
    test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
    await openRoute(page, GALLERY_ROUTE);

    await expect(page.locator('.property-summary--lead')).toHaveCSS('position', 'static');
    await expect(page.locator('.property-summary--panel')).toBeHidden();
    await expect(page.locator('.property-detail__panel')).toHaveCSS('position', 'static');
  });
});

// D.13b: el histórico cabe a 320 px envolviendo las celdas; sin desplazamiento horizontal.
test.describe('ficha: el histórico de precios a 320 px', () => {
  for (const detailRoute of [HISTORY_ROUTE, GALLERY_ROUTE]) {
    test(`${detailRoute.name}: la tabla no desborda y «Variación» se ve entera`, async ({ page }) => {
      test.skip(test.info().project.name !== 'w320-light', 'solo el ancho móvil');
      await openRoute(page, detailRoute);

      await expect(page.locator('.price-history')).toBeVisible();
      const tableOverflow = await page
        .locator('.price-history__scroll')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(tableOverflow).toBeLessThanOrEqual(0);
      const pageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(pageOverflow).toBeLessThanOrEqual(0);
      const box = await page.getByRole('columnheader', { name: 'Variación' }).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    });
  }
});

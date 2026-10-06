// Paso D.9 (decisiones 172, 173 y 175) — la ficha más allá de la captura: la galería se
// recorre sin JavaScript con las anclas de fragmento, y ningún elemento enfocable queda
// tapado por el panel sticky ni por nada más (WCAG 2.4.11), tampoco cuando el panel
// tiene que desplazarse por dentro. Se usa la ficha de P7 (`detail-gallery`): la única
// con dos fotos.
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

interface FocusedElement {
  readonly label: string;
  readonly inPanel: boolean;
  // Ya se había enfocado antes en este recorrido: el Tab ha dado la vuelta.
  readonly revisited: boolean;
}

interface FocusStep {
  readonly label: string;
  readonly inPanel: boolean;
  readonly panelScrollTop: number;
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

    const panel = element.closest('.property-detail__panel');
    if (panel !== null) {
      const panelBox = panel.getBoundingClientRect();
      const visible = {
        left: Math.max(panelBox.left, viewport.left),
        top: Math.max(panelBox.top, viewport.top),
        right: Math.min(panelBox.right, viewport.right),
        bottom: Math.min(panelBox.bottom, viewport.bottom),
      };
      if (!overlaps(box, visible)) problems.push('fuera de la parte visible del panel');
    }
    return problems;
  });
}

// Recorre con Tab TODOS los enfocables de la ficha y comprueba cada uno. Devuelve los pasos.
async function walkFocus(page: Page): Promise<readonly FocusStep[]> {
  const steps: FocusStep[] = [];
  for (let tab = 0; tab < MAX_TABS; tab += 1) {
    await page.keyboard.press('Tab');
    const focused = await describeFocus(page);
    // Fin del recorrido: el foco sale del documento o vuelve a uno ya visitado.
    if (focused === null || focused.revisited) return steps;
    await expect
      .poll(() => focusProblems(page), {
        message: `foco tapado en «${focused.label}» (paso ${String(tab + 1)})`,
      })
      .toEqual([]);
    const panelScrollTop = await page
      .locator('.property-detail__panel')
      .evaluate((panel) => panel.scrollTop);
    steps.push({ label: focused.label, inPanel: focused.inPanel, panelScrollTop });
  }
  throw new Error(`el recorrido con Tab no terminó en ${String(MAX_TABS)} pasos`);
}

const FOCUS_CASES = [
  { project: 'w1280-light', viewport: null, name: '1280 de ancho' },
  // El panel de P7 mide unos 555 px y su tope es la ventana menos 2rem: a 600 de alto
  // todavía cabe entero. A 480 tiene que desplazarse por dentro (se comprueba abajo).
  {
    project: 'w1280-light',
    viewport: { width: 1280, height: 480 },
    name: '1280×480, panel con desplazamiento interno',
  },
  { project: 'w320-light', viewport: null, name: '320 de ancho' },
] as const;

test.describe('ficha: el foco nunca queda tapado (WCAG 2.4.11)', () => {
  for (const focusCase of FOCUS_CASES) {
    test(`Tab por todos los enfocables, a ${focusCase.name}`, async ({ page }) => {
      test.skip(test.info().project.name !== focusCase.project, `solo ${focusCase.project}`);
      if (focusCase.viewport !== null) await page.setViewportSize(focusCase.viewport);
      await openRoute(page, GALLERY_ROUTE);

      const panel = page.locator('.property-detail__panel');
      const panelScrolls = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
      // El caso bajo solo tiene sentido si el panel se desplaza de verdad por dentro.
      if (focusCase.viewport !== null) expect(panelScrolls).toBe(true);

      const steps = await walkFocus(page);
      const labels = steps.map((step) => step.label);
      for (const expected of [
        'Saltar al contenido',
        'Volver a la búsqueda',
        'Foto siguiente',
        'Foto anterior',
        'Ver en Idealista ↗ (web externa)',
        'Ver en Kyero ↗ (web externa)',
      ]) {
        expect(labels).toContain(expected);
      }
      expect(steps.filter((step) => step.inPanel).length).toBeGreaterThanOrEqual(2);
      // A 1280×480 el foco obligó al panel a desplazarse por dentro para enseñar un enlace.
      if (focusCase.viewport !== null) {
        expect(Math.max(...steps.map((step) => step.panelScrollTop))).toBeGreaterThan(0);
      }
    });
  }
});

// Paso D.20 (spec result-row-presentation R2.1/S2.5; diseño «Row-height delta») — la fila de
// resultado debe seguir siendo fina. Las alturas de abajo se midieron en Docker (Chromium + Liberation
// Sans) sobre el código SIN cambiar de D.20, antes de tocar ningún CSS. La siembra no tiene filas con
// foto: las cinco son «Sin foto»; la primera es la de varias fuentes (insignia `--multi`) y el resto
// tiene una sola fuente. El margen de +4 px es el del spec (R2.1).
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { openRoute, ROUTES, type E2eRoute } from './routes';

const ROW_HEIGHT_TOLERANCE = 4;

function route(name: string): E2eRoute {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

// Alturas por fila, en el orden de la lista. La tema no cambia la medida, pero se fija por proyecto
// para que un desvío en oscuro también se vea.
const BASELINE_ROW_HEIGHT: Readonly<Record<string, readonly number[]>> = {
  'w320-light': [141, 139, 139, 139, 159],
  'w320-dark': [141, 139, 139, 139, 159],
  'w768-light': [145, 145, 145, 145, 145],
  'w768-dark': [145, 145, 145, 145, 145],
  'w1280-light': [145, 145, 145, 145, 145],
  'w1280-dark': [145, 145, 145, 145, 145],
};

test.describe('D.20 altura de la fila de resultado', () => {
  test('ninguna fila crece más de 4 px sobre la altura previa a D.20', async ({ page }, testInfo) => {
    const home = ROUTES.find((candidate) => candidate.name === 'home');
    if (home === undefined) throw new Error('falta la ruta home');
    const pinned = BASELINE_ROW_HEIGHT[testInfo.project.name];
    if (pinned === undefined) throw new Error(`sin alturas fijadas para ${testInfo.project.name}`);

    await openRoute(page, home);
    const heights = await page
      .locator('.result-list > li')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));

    expect(heights.length, 'mismo número de filas que al medir').toBe(pinned.length);
    heights.forEach((height, index) => {
      expect(height, `fila ${String(index + 1)}`).toBeLessThanOrEqual(
        (pinned[index] ?? 0) + ROW_HEIGHT_TOLERANCE
      );
    });
  });
});

// D.20 (decisión 235; spec «search-header-motif» S1.3-S1.6) — el motivo de curvas de nivel junto al
// título de la búsqueda: solo ahí, sin mover nada, sin desbordar a 320 px y fuera del orden de foco.
const MOTIF_HIDDEN = '.contour-motif{display:none}';
const TAB_STEPS = 20;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.locator(selector).first().boundingBox();
}

// Recorre el foco con Tab y devuelve un descriptor estable de cada parada; el svg nunca puede estarlo.
async function tabWalk(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const stops: string[] = [];
  for (let step = 0; step < TAB_STEPS; step += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return 'null';
      if (active.closest('.contour-motif') !== null) return 'MOTIF';
      const name = active.getAttribute('aria-label') ?? active.getAttribute('id') ?? active.textContent.trim();
      return `${active.tagName}|${active.className}|${name.slice(0, 40)}`;
    });
    stops.push(stop);
  }
  return stops;
}

test.describe('D.20 motivo de curvas de nivel', () => {
  for (const name of ['detail', 'not-found-route', 'not-found-property', 'nl-query']) {
    test(`S1.3 ${name} no lleva motivo`, async ({ page }) => {
      await openRoute(page, route(name));
      await expect(page.locator('.contour-motif')).toHaveCount(0);
    });
  }

  test('S1.3 la home lleva exactamente un motivo, dentro de la franja de bienvenida (D.22)', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator('.contour-motif')).toHaveCount(1);
    await expect(page.locator('.search-header > .home-hero > .contour-motif')).toHaveCount(1);
  });

  test('S1.3 una página de resultados lleva un motivo, dentro de la cabecera de la búsqueda', async ({ page }) => {
    await page.goto('/?operation=sale');
    await expect(page.locator('.contour-motif')).toHaveCount(1);
    await expect(page.locator('.search-header > .contour-motif')).toHaveCount(1);
  });

  test('S1.4 el motivo no desplaza el título ni la franja de la portada', async ({ page }) => {
    await openRoute(page, route('home'));
    const before = {
      title: await boxOf(page, '.home-hero > h1'),
      hero: await boxOf(page, '.home-hero'),
      results: await boxOf(page, '.search-results'),
    };
    expect(before.title).not.toBeNull();
    await page.addStyleTag({ content: MOTIF_HIDDEN });
    const after = {
      title: await boxOf(page, '.home-hero > h1'),
      hero: await boxOf(page, '.home-hero'),
      results: await boxOf(page, '.search-results'),
    };
    expect(after).toEqual(before);
  });

  test('S1.4 el motivo no desplaza el título ni la cabecera en los resultados', async ({ page }) => {
    await page.goto('/?operation=sale');
    const before = {
      title: await boxOf(page, '.search-header > h1'),
      header: await boxOf(page, '.search-header'),
      results: await boxOf(page, '.search-results'),
    };
    expect(before.title).not.toBeNull();
    await page.addStyleTag({ content: MOTIF_HIDDEN });
    const after = {
      title: await boxOf(page, '.search-header > h1'),
      header: await boxOf(page, '.search-header'),
      results: await boxOf(page, '.search-results'),
    };
    expect(after).toEqual(before);
  });

  // D.22: en la portada el motivo ocupa la esquina de la franja a partir de 48rem y se oculta antes.
  test('el motivo de la franja se oculta bajo 48rem y, en escritorio, queda dentro de ella', async ({ page }) => {
    await openRoute(page, route('home'));
    const motif = page.locator('.home-hero > .contour-motif');
    if (test.info().project.name.startsWith('w320')) {
      await expect(motif).toBeHidden();
      return;
    }
    await expect(motif).toBeVisible();
    const hero = await boxOf(page, '.home-hero');
    const box = await boxOf(page, '.home-hero > .contour-motif');
    expect(hero).not.toBeNull();
    expect(box).not.toBeNull();
    if (hero === null || box === null) return;
    expect(box.x + box.width).toBeLessThanOrEqual(hero.x + hero.width + 0.5);
    expect(box.y).toBeGreaterThanOrEqual(hero.y - 0.5);
  });

  test('S1.5 a 320 px no desborda, queda recortado y a la derecha del texto del título', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('w320'), 'solo 320 px');
    // D.22: la portada oculta el motivo a 320 px; la comprobación vale en la cabecera de los resultados.
    await page.goto('/?operation=sale');
    await page.evaluate(() => document.fonts.ready);
    const page320 = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(page320.scroll).toBeLessThanOrEqual(page320.client);

    const motif = await boxOf(page, '.contour-motif');
    const header = await boxOf(page, '.search-header');
    expect(motif).not.toBeNull();
    expect(header).not.toBeNull();
    if (motif === null || header === null) return;
    expect(motif.width).toBeLessThanOrEqual(72.5);
    expect(motif.x + motif.width).toBeLessThanOrEqual(header.x + header.width + 0.5);

    const textRight = await page.locator('.search-header > h1').evaluate((title) => {
      const range = document.createRange();
      range.selectNodeContents(title);
      return range.getBoundingClientRect().right;
    });
    expect(motif.x).toBeGreaterThanOrEqual(textRight - 0.5);
  });

  test('S1.6 el motivo no entra en el orden de tabulación', async ({ page }) => {
    await openRoute(page, route('home'));
    const withMotif = await tabWalk(page);
    expect(withMotif).not.toContain('MOTIF');

    await openRoute(page, route('home'));
    await page.addStyleTag({ content: MOTIF_HIDDEN });
    const withoutMotif = await tabWalk(page);
    expect(withMotif).toEqual(withoutMotif);
  });
});

// D.20 (decisión 237, revisión visual) — en ancho el precio de la ficha es una banda elevada que sangra
// 1rem a cada lado para que su texto caiga en el borde de la columna, alineado con la rejilla de datos.
// El sangrado no puede desbordar la página a ningún ancho.
test.describe('D.20 banda de precio de la ficha', () => {
  test('el texto del precio alinea con la rejilla de datos y la banda no desborda', async ({ page }, testInfo) => {
    await openRoute(page, route('detail'));
    const scroll = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);

    const wide = testInfo.project.name.startsWith('w1280');
    const summary = page.locator('.property-summary--panel');
    if (!wide) {
      await expect(summary).toBeHidden();
      return;
    }
    const price = await boxOf(page, '.property-summary--panel .property-summary__price');
    const facts = await boxOf(page, '.property-facts__list');
    const band = await boxOf(page, '.property-summary--panel');
    expect(price).not.toBeNull();
    expect(facts).not.toBeNull();
    expect(band).not.toBeNull();
    if (price === null || facts === null || band === null) return;
    expect(Math.abs(price.x - facts.x)).toBeLessThanOrEqual(0.5);
    expect(band.x).toBeCloseTo(facts.x - 16, 0);
    expect(band.x).toBeGreaterThanOrEqual(0);
    expect(band.x + band.width).toBeLessThanOrEqual(scroll.client);
  });
});

// D.21 (UI-1b, S-UI-2e) — contraste del color de los enlaces al pasar el puntero. axe no puede
// pasar el ratón, así que se mide con los colores calculados (OKLab → sRGB con un canvas 1x1) en los
// dos esquemas. Bajo `reduce` el color cambia al instante, de modo que no hace falta esperar.
const HOVER_CONTRAST_MIN = 4.5;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

async function colours(page: Page, selector: string): Promise<{ fg: Rgb; bg: Rgb }> {
  return page.evaluate((sel) => {
    const toRgb = (css: string): { r: number; g: number; b: number } => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas sin contexto 2d');
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const element = document.querySelector(sel);
    if (element === null) throw new Error(`no existe ${sel}`);
    return {
      fg: toRgb(getComputedStyle(element).color),
      bg: toRgb(getComputedStyle(document.body).backgroundColor),
    };
  }, selector);
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test.describe('D.21 contraste del hover de enlaces', () => {
  for (const selector of ['.empty-results__action a', '.pagination__prev']) {
    test(`S-UI-2e ${selector} cumple 4,5:1 con el puntero encima`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('w1280'), 'solo 1280 px, claro y oscuro');
      await page.goto('/?page=2');
      const link = page.locator(selector);
      await link.hover();
      const hovered = await colours(page, selector);
      await page.mouse.move(2, 2);
      const rest = await colours(page, selector);
      expect(hovered.fg, 'el hover cambia el color').not.toEqual(rest.fg);
      expect(contrastRatio(hovered.fg, hovered.bg)).toBeGreaterThanOrEqual(HOVER_CONTRAST_MIN);
    });
  }
});

// D.21 (decisión 243, S-PL-2) — el desvanecido del motivo es una máscara de alfa en el propio svg: no
// mueve nada (lo cubre S1.4) y no pinta un marco con el trazo heredado.
test.describe('D.21 máscara del motivo de curvas de nivel', () => {
  test('S-PL-2 la máscara es de alfa y su rect no tiene trazo', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator('.contour-motif mask')).toHaveCount(1);
    expect(await page.locator('.contour-motif__mask').evaluate((node) => getComputedStyle(node).maskType)).toBe('alpha');
    expect(await page.locator('.contour-motif__fade').evaluate((node) => getComputedStyle(node).stroke)).toBe('none');
    const scroll = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
  });
});

// D.21 (decisión 12, S-PL-3) — el filete de la banda de precio mide lo que la columna, como los filetes
// de la lista de fuentes, y la banda no cambia de alto ni de fondo. El filete es un ::after: su caja se
// deduce de la de la banda y de los valores calculados del pseudoelemento.
const BAND_HEIGHT = 89;
const RULE_EDGE_TOLERANCE = 1;

test.describe('D.21 filete de la banda de precio', () => {
  test('S-PL-3 los extremos del filete coinciden con los de los filetes de la lista de fuentes', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('w1280'), 'la banda solo existe desde 64rem');
    await openRoute(page, route('detail'));
    const band = page.locator('.property-summary--panel');
    const box = await boxOf(page, '.property-summary--panel');
    const source = await boxOf(page, '.source-row');
    expect(box).not.toBeNull();
    expect(source).not.toBeNull();
    if (box === null || source === null) return;

    const line = await band.evaluate((node) => {
      const after = getComputedStyle(node, '::after');
      return {
        content: after.content,
        position: after.position,
        left: Number.parseFloat(after.left),
        right: Number.parseFloat(after.right),
        thickness: Number.parseFloat(after.borderBottomWidth),
        style: after.borderBottomStyle,
        colour: after.borderBottomColor,
        ruleColour: ((): string => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--rule)';
          document.body.append(probe);
          const resolved = getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        })(),
        ownBorder: getComputedStyle(node).borderBottomWidth,
        background: getComputedStyle(node).backgroundColor,
      };
    });
    expect(line.position).toBe('absolute');
    expect(line.thickness).toBe(1);
    expect(line.style).toBe('solid');
    expect(line.colour).toBe(line.ruleColour);
    expect(line.ownBorder).toBe('0px');

    // Extremos del filete en la página: la caja de la banda más el desplazamiento de `inset-inline`.
    const lineLeft = box.x + line.left;
    const lineRight = box.x + box.width - line.right;
    expect(Math.abs(lineLeft - source.x)).toBeLessThanOrEqual(RULE_EDGE_TOLERANCE);
    expect(Math.abs(lineRight - (source.x + source.width))).toBeLessThanOrEqual(RULE_EDGE_TOLERANCE);
    // La banda mide lo mismo que antes (5.5rem + 1px) y conserva su superficie.
    expect(Math.abs(box.height - BAND_HEIGHT)).toBeLessThanOrEqual(1);
    const raised = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--surface-raised)';
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    });
    expect(line.background).toBe(raised);
  });
});

// D.21 (decisión 243, S-PL-4/S-PL-5) — la etiqueta de operación de la fila y la de estado del aviso de
// cobertura se distinguen sin color: la segunda lleva un cuadrado relleno antes del texto. Las capturas
// en escala de grises se adjuntan al informe para su revisión (el veredicto va al registro de revisión).
test.describe('D.21 marcador del estado de cobertura', () => {
  test('S-PL-4/5 el estado lleva marcador, la operación no, y se distinguen en grises', async ({ page }, testInfo) => {
    await openRoute(page, route('coverage-running'));
    const state = page.locator('.coverage-notice__state').first();
    await expect(state).toBeVisible();
    const marker = await state.evaluate((node) => {
      const before = getComputedStyle(node, '::before');
      return {
        content: before.content,
        width: before.width,
        height: before.height,
        display: before.display,
        background: before.backgroundColor,
        colour: getComputedStyle(node).color,
        text: node.textContent,
      };
    });
    expect(marker.width).toBe('8px');
    expect(marker.height).toBe('8px');
    expect(marker.display).toBe('inline-block');
    expect(marker.background).toBe(marker.colour);
    expect(marker.content).toBe('""');
    expect(marker.text.trim().length).toBeGreaterThan(0);

    await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
    await testInfo.attach('estado-cobertura-grises', { body: await state.screenshot(), contentType: 'image/png' });

    await openRoute(page, route('home'));
    const operation = page.locator('.result-row__operation').first();
    await expect(operation).toBeVisible();
    const before = await operation.evaluate((node) => getComputedStyle(node, '::before').content);
    expect(before).toBe('none');
    await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
    await testInfo.attach('etiqueta-operacion-grises', { body: await operation.screenshot(), contentType: 'image/png' });
  });
});

// D.21, lote de pulido tras la revisión (P1 y P2).
test.describe('D.21 pulido: motivo y etiqueta de estado', () => {
  test('P1 bajo 400 px se retiran los dos anillos exteriores; desde 400 px se ven los cinco', async ({ page }) => {
    await openRoute(page, route('home'));
    const projectWidth = page.viewportSize()?.width ?? 0;
    const displays = await page
      .locator('.contour-motif path')
      .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).display));
    expect(displays).toHaveLength(5);
    const expected = projectWidth < 400 ? ['inline', 'inline', 'inline', 'none', 'none'] : Array<string>(5).fill('inline');
    expect(displays).toEqual(expected);
  });

  test('P1 el desvanecido es radial: el degradado de la máscara es un radialGradient', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator('.contour-motif radialGradient#contour-motif-fade')).toHaveCount(1);
    await expect(page.locator('.contour-motif linearGradient')).toHaveCount(0);
  });

  test('P2 la etiqueta de estado mide 14 px y su marcador 8 px', async ({ page }) => {
    await openRoute(page, route('coverage-running'));
    const state = page.locator('.coverage-notice__state').first();
    await expect(state).toBeVisible();
    const measured = await state.evaluate((node) => ({
      fontSize: getComputedStyle(node).fontSize,
      marker: getComputedStyle(node, '::before').width,
      title: getComputedStyle(node.closest('.coverage-notice')?.querySelector('.coverage-notice__title') ?? node).fontSize,
    }));
    expect(measured.fontSize).toBe('14px');
    expect(measured.marker).toBe('8px');
    expect(Number.parseFloat(measured.title)).toBeGreaterThan(Number.parseFloat(measured.fontSize));
  });
});

// D.21, lote de pulido tras la revisión (P3, P6 y P7).
test.describe('D.21 pulido: ficha (gráfico, tabla y etiquetas)', () => {
  test('P3 el gráfico llena la columna: un solo diseño visible, al 100 % del ancho de la figura', async ({ page }) => {
    await openRoute(page, route('detail-history'));
    const measured = await page.locator('.price-chart').evaluate((figure) => {
      const visible = [...figure.querySelectorAll<SVGSVGElement>('.price-chart__plot')].filter(
        (plot) => getComputedStyle(plot).display !== 'none'
      );
      return {
        visible: visible.length,
        plot: visible[0]?.getBoundingClientRect().width ?? 0,
        figure: figure.getBoundingClientRect().width,
        name: visible[0]?.getAttribute('aria-label') ?? '',
      };
    });
    expect(measured.visible).toBe(1);
    expect(measured.plot).toBeGreaterThanOrEqual(measured.figure - 1);
    expect(measured.name).toMatch(/^Gráfico escalonado/);
  });

  test('P3 el eje de precio tiene tres marcas y el último punto queda dentro de la rejilla', async ({ page }) => {
    await openRoute(page, route('detail-history'));
    const geometry = await page.locator('.price-chart').evaluate((figure) => {
      const plot = [...figure.querySelectorAll<SVGSVGElement>('.price-chart__plot')].find(
        (candidate) => getComputedStyle(candidate).display !== 'none'
      );
      if (plot === undefined) return null;
      const ticks = [...plot.querySelectorAll('text.price-chart__label')]
        .map((label) => label.textContent)
        .filter((text) => text.includes('€'));
      const rightEdge = (element: SVGGraphicsElement): number => {
        const box = element.getBBox();
        return box.x + box.width;
      };
      const gridEnd = Math.max(...[...plot.querySelectorAll<SVGGraphicsElement>('.price-chart__grid')].map(rightEdge));
      const pointsEnd = Math.max(...[...plot.querySelectorAll<SVGGraphicsElement>('.price-chart__marker')].map(rightEdge));
      return { ticks, gridEnd, pointsEnd };
    });
    expect(geometry).not.toBeNull();
    if (geometry === null) return;
    expect(geometry.ticks).toHaveLength(3);
    expect(geometry.gridEnd - geometry.pointsEnd).toBeGreaterThanOrEqual(12);
  });

  test('P6 las columnas del histórico están en las mismas posiciones en todas las fichas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('w320'), 'bajo 30rem la tabla se apila');
    const columns: Array<ReadonlyArray<readonly [number, number]>> = [];
    for (const name of ['detail-history', 'detail', 'detail-gallery']) {
      await openRoute(page, route(name));
      columns.push(
        await page.locator('.price-history__table th').evaluateAll((heads) => {
          const table = heads[0]?.closest('table')?.getBoundingClientRect().x ?? 0;
          return heads.map((head) => {
            const box = head.getBoundingClientRect();
            return [Math.round(box.x - table), Math.round(box.width)] as const;
          });
        })
      );
    }
    expect(columns[0]).toHaveLength(4);
    expect(columns[1]).toEqual(columns[0]);
    expect(columns[2]).toEqual(columns[0]);
  });

  test('P6 la nota de datos que faltan es la clave de la leyenda del guion', async ({ page }) => {
    await openRoute(page, route('detail-gallery'));
    const notes = await page.locator('.property-facts__note').allTextContents();
    for (const note of notes) expect(note.trim()).toBe('—: no consolidado; consulta los anuncios de origen');
  });

  test('P7 «Último precio más bajo» y «Más económico» comparten peso, tamaño y trazo discreto', async ({ page }) => {
    const measure = async (name: string): Promise<{ weight: string; size: string; border: string; colour: string } | null> => {
      await openRoute(page, route(name));
      return page.locator('.source-row__highlight').first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { weight: style.fontWeight, size: style.fontSize, border: style.borderTopColor, colour: style.color };
      });
    };
    const cheapest = await measure('detail-single');
    const lowest = await measure('detail-gallery');
    expect(cheapest).not.toBeNull();
    expect(lowest).not.toBeNull();
    if (cheapest === null || lowest === null) return;
    expect(lowest.weight).toBe(cheapest.weight);
    expect(lowest.weight).toBe('400');
    expect(lowest.size).toBe(cheapest.size);
    // El borde de «Último precio más bajo» ya no es la tinta del texto.
    expect(lowest.border).not.toBe(lowest.colour);
    await openRoute(page, route('detail-gallery'));
    await expect(page.locator('.source-row__highlight').first()).toHaveText('Último precio más bajo');
  });

  test('P7 la fecha de inicio del aviso fallido no se parte en dos líneas', async ({ page }) => {
    await openRoute(page, route('coverage-failed'));
    const lines = await page.locator('.coverage-notice__date').evaluate((node) => node.getClientRects().length);
    expect(lines).toBe(1);
  });
});

// D.21, lote de pulido tras la revisión (P4, P5 y P8).
test.describe('D.21 pulido: formulario de revisión, chips y cobertura sin resultados', () => {
  test('P4 los pares llenan su columna, las etiquetas se ven cortas y el nombre accesible sigue completo', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    const price = page.locator('fieldset.criteria-range', { has: page.locator('legend', { hasText: 'Precio (€)' }) });
    await expect(price.locator('label').first()).toHaveText('Precio mínimo (€)');
    const visible = await price.locator('label').evaluateAll((labels) =>
      labels.map((label) => {
        const visibleText = [...label.childNodes]
          .filter((node) => !(node instanceof HTMLElement && node.classList.contains('sr-only')))
          .map((node) => node.textContent)
          .join('')
          .trim();
        return { visibleText, firstLetter: getComputedStyle(label, '::first-letter').textTransform };
      })
    );
    expect(visible.map((entry) => entry.visibleText)).toEqual(['mínimo', 'máximo']);
    expect(visible.map((entry) => entry.firstLetter)).toEqual(['uppercase', 'uppercase']);
    await expect(page.getByLabel('Precio máximo (€)')).toBeVisible();

    // Sin hueco muerto: los dos números ocupan todo el ancho del par (mismo ancho y sin sobrar a la derecha).
    const fields = await price.evaluate((fieldset) => {
      const inputs = [...fieldset.querySelectorAll('input')].map((input) => input.getBoundingClientRect());
      const last = inputs[1];
      return {
        right: last === undefined ? 0 : last.x + last.width,
        box: fieldset.getBoundingClientRect(),
        widths: inputs.map((box) => box.width),
      };
    });
    expect(Math.abs(fields.right - (fields.box.x + fields.box.width))).toBeLessThanOrEqual(1);
    expect(Math.abs((fields.widths[0] ?? 0) - (fields.widths[1] ?? 1))).toBeLessThanOrEqual(1);
  });

  test('P4 la leyenda no toca las etiquetas y habitaciones y baños tienen su propio grupo', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    const gap = await page
      .locator('fieldset.criteria-range legend')
      .first()
      .evaluate((legend) => {
        const label = legend.parentElement?.querySelector('label')?.getBoundingClientRect();
        return label === undefined ? 0 : label.y - legend.getBoundingClientRect().bottom;
      });
    expect(gap).toBeGreaterThanOrEqual(5);

    const group = page.locator('.criteria-group', { has: page.getByLabel('Habitaciones (mínimo)') });
    await expect(group.locator('h3')).toHaveText('¿Cuántas habitaciones y baños?');
    await expect(group.getByLabel('Baños (mínimo)')).toBeVisible();
    await expect(group.getByLabel('Superficie máxima (m²)')).toHaveCount(0);
    // Una etiqueta que envuelve a 320px no desplaza el campo vecino: los dos números quedan a la misma altura.
    const tops = await group.locator('input').evaluateAll((inputs) => inputs.map((input) => Math.round(input.getBoundingClientRect().bottom)));
    expect(tops).toHaveLength(2);
    expect(tops[0]).toBe(tops[1]);
  });

  test('P4 el título de «Orden de los resultados» tiene el mismo estilo que los demás grupos', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    const styles = await page.locator('.criteria-group > h3').evaluateAll((headings) =>
      headings.map((heading) => {
        const style = getComputedStyle(heading);
        return `${style.fontSize}/${style.fontWeight}/${style.color}`;
      })
    );
    expect(styles.length).toBe(6);
    expect(new Set(styles).size).toBe(1);
  });

  test('P5 el primer chip empieza en el margen y el recuento y «Quitar todos» se alinean con su fila', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    const measured = await page.evaluate(() => {
      const box = (selector: string): DOMRect | null => document.querySelector(selector)?.getBoundingClientRect() ?? null;
      return {
        chip: box('.applied-filters__chip'),
        count: box('.applied-filters__count'),
        clear: box('.applied-filters__clear'),
        gutter: box('.search-header > h1'),
        list: box('.search-results__list'),
      };
    });
    const { chip, count, clear, gutter, list } = measured;
    if (chip === null || count === null || clear === null || gutter === null || list === null) {
      throw new Error('faltan elementos de la fila de chips');
    }
    const width = page.viewportSize()?.width ?? 0;
    if (width < 640) {
      // Apilado: el chip empieza en el margen de la página, no 4px dentro.
      expect(Math.abs(chip.x - gutter.x)).toBeLessThanOrEqual(1);
    } else {
      // En fila: recuento, chips y «Quitar todos» comparten la parte alta de la primera fila.
      expect(Math.abs(count.y - chip.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(clear.y - chip.y)).toBeLessThanOrEqual(1);
    }
    // «Quitar todos» no sale de la columna de la lista.
    expect(clear.x + clear.width).toBeLessThanOrEqual(list.x + list.width + 1);
  });

  test('P5 los enlaces de ordenación empiezan en el margen de la página', async ({ page }) => {
    test.skip(test.info().project.name.startsWith('w1280'), 'a 1280 la ordenación comparte fila con «Filtros»');
    // D.22: la portada lleva su titular dentro de la franja; el margen se mide en los resultados.
    await page.goto('/?operation=sale');
    const offsets = await page.evaluate(() => ({
      link: document.querySelector('.sort-presets__link')?.getBoundingClientRect().x ?? -1,
      title: document.querySelector('.search-header > h1')?.getBoundingClientRect().x ?? -2,
    }));
    expect(Math.abs(offsets.link - offsets.title)).toBeLessThanOrEqual(1);
  });

  test('P8 con 0 resultados no hay «Ver mapa» y el aviso y el vacío comparten superficie', async ({ page }) => {
    await openRoute(page, route('coverage-running'));
    await expect(page.locator('.view-toggle')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver mapa' })).toHaveCount(0);
    const surfaces = await page.evaluate(() => ({
      panel: getComputedStyle(document.querySelector('.coverage-panel') ?? document.body).backgroundColor,
      empty: getComputedStyle(document.querySelector('.empty-results') ?? document.body).backgroundColor,
    }));
    expect(surfaces.empty).toBe(surfaces.panel);
  });

  test('P8 desde 64rem el mapa empieza en la fila del aviso de cobertura', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('w1280'), 'solo en ancho');
    await openRoute(page, route('coverage-running'));
    const tops = await page.evaluate(() => ({
      notice: document.querySelector('.search-results__notices')?.getBoundingClientRect().y ?? -1,
      map: document.querySelector('.search-results__map')?.getBoundingClientRect().y ?? -2,
      list: document.querySelector('.search-results__list')?.getBoundingClientRect().y ?? -3,
    }));
    expect(Math.abs(tops.map - tops.notice)).toBeLessThanOrEqual(1);
    expect(tops.list).toBeGreaterThan(tops.notice);
    // El alto del mapa no se reparte a la fila del aviso: el vacío empieza justo bajo él (gap de 1,5rem).
    const gap = await page.evaluate(() => {
      const notice = document.querySelector('.search-results__notices')?.getBoundingClientRect();
      const list = document.querySelector('.search-results__list')?.getBoundingClientRect();
      return notice === undefined || list === undefined ? -1 : list.y - (notice.y + notice.height);
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(25);
  });

  test('P8 con resultados y sin aviso, el mapa y la lista siguen alineados', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('w1280'), 'solo en ancho');
    await openRoute(page, route('home'));
    const tops = await page.evaluate(() => {
      const notices = document.querySelector('.search-results__notices');
      return {
        map: document.querySelector('.search-results__map')?.getBoundingClientRect().y ?? -2,
        list: document.querySelector('.search-results__list')?.getBoundingClientRect().y ?? -3,
        noticesHidden: notices === null || getComputedStyle(notices).display === 'none',
      };
    });
    expect(tops.noticesHidden).toBe(true);
    expect(Math.abs(tops.map - tops.list)).toBeLessThanOrEqual(1);
  });
});

// D.21, segunda revisión visual (F1-F4).
test.describe('D.21 segunda revisión: separación, pares, rótulos del gráfico y motivo', () => {
  test('F1 con 0 resultados la última fila de chips no toca el estado vacío (separación ≥ 16 px)', async ({ page }) => {
    await openRoute(page, route('home-filtered'));
    const gap = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.applied-filters__chip')].map((chip) => chip.getBoundingClientRect().bottom);
      const empty = document.querySelector('.empty-results')?.getBoundingClientRect().top ?? -1;
      return empty - Math.max(...chips);
    });
    expect(gap).toBeGreaterThanOrEqual(16);
  });

  test('F2 los tres pares del formulario de revisión comparten las posiciones de sus columnas', async ({ page }) => {
    await openRoute(page, route('nl-query'));
    const pairs = await page.locator('.criteria-range').evaluateAll((ranges) =>
      ranges.map((range) =>
        [...range.querySelectorAll('input')].map((input) => {
          const box = input.getBoundingClientRect();
          return [Math.round(box.x), Math.round(box.x + box.width)];
        })
      )
    );
    expect(pairs).toHaveLength(3);
    expect(pairs[1]).toEqual(pairs[0]);
    expect(pairs[2]).toEqual(pairs[0]);
  });

  test('F4 el texto del gráfico se ve a 1:1 (12 px ± 1) en este ancho', async ({ page }) => {
    await openRoute(page, route('detail-history'));
    const rendered = await page.locator('.price-chart').evaluate((figure) => {
      const plot = [...figure.querySelectorAll<SVGSVGElement>('.price-chart__plot')].find(
        (candidate) => getComputedStyle(candidate).display !== 'none'
      );
      const label = plot?.querySelector('text.price-chart__label');
      if (plot === undefined || label === null || label === undefined) return null;
      const viewBoxWidth = plot.viewBox.baseVal.width;
      return parseFloat(getComputedStyle(label).fontSize) * (plot.getBoundingClientRect().width / viewBoxWidth);
    });
    expect(rendered).not.toBeNull();
    expect(Math.abs((rendered ?? 0) - 12)).toBeLessThanOrEqual(1);
  });

  test('F3 bajo 400 px la curva gruesa es el segundo anillo; desde 400 px, el tercero', async ({ page }) => {
    await openRoute(page, route('home'));
    const widths = await page
      .locator('.contour-motif path')
      .evaluateAll((paths) => paths.map((path) => parseFloat(getComputedStyle(path).strokeWidth)));
    const narrow = (page.viewportSize()?.width ?? 0) < 400;
    expect(widths).toEqual(narrow ? [1, 2, 1, 1, 1] : [1, 1, 2, 1, 1]);
  });
});

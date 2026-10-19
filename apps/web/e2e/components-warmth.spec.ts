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

  test('S1.3 la home lleva exactamente un motivo, dentro de la cabecera de la búsqueda', async ({ page }) => {
    await openRoute(page, route('home'));
    await expect(page.locator('.contour-motif')).toHaveCount(1);
    await expect(page.locator('.search-header > .contour-motif')).toHaveCount(1);
  });

  test('S1.4 el motivo no desplaza el título ni la cabecera', async ({ page }) => {
    await openRoute(page, route('home'));
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

  test('S1.5 a 320 px no desborda, queda recortado y a la derecha del texto del título', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('w320'), 'solo 320 px');
    await openRoute(page, route('home'));
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

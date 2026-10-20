// Paso D.21, lote de pulido tras la revisión (decisión 14 del mantenedor, grupos P1-P8) — forma de las
// reglas de `globals.css` que corrigen los detalles hallados en las capturas. Lee el CSS como texto
// (sin navegador); las medidas reales (geometría, estilos calculados) viven en
// `e2e/components-warmth.spec.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseCss, type CssNode } from './helpers/css-tokens';

const CSS_PATH = join(fileURLToPath(new URL('../src', import.meta.url)), 'app', 'globals.css');
const ROOT = parseCss(readFileSync(CSS_PATH, 'utf8'));

interface Rule {
  /** Selector normalizado: espacios colapsados y comillas fuera. */
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
  /** Preludios de los at-rules que envuelven la regla, del más externo al más interno. */
  readonly ancestors: readonly string[];
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').replace(/['"]/g, '').trim();

function collect(node: CssNode, ancestors: readonly string[] = []): Rule[] {
  return node.children.flatMap((child) => {
    const prelude = normalize(child.prelude);
    if (prelude.startsWith('@')) return collect(child, [...ancestors, prelude]);
    return [{ selector: prelude, declarations: new Map(child.declarations), ancestors }, ...collect(child, ancestors)];
  });
}

const RULES = collect(ROOT);

/** Parte una lista de selectores por las comas de primer nivel (no las de `:has(...)` ni `:is(...)`). */
function selectorParts(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** Las reglas de ese selector (cada lista de selectores se parte en sus partes). */
function rulesFor(selector: string): Rule[] {
  return RULES.filter((rule) => selectorParts(rule.selector).includes(selector));
}

/** Declaraciones fusionadas de las reglas del selector que no están bajo ningún @media/@container/@supports. */
function base(selector: string): Map<string, string> {
  const found = rulesFor(selector).filter((rule) => !rule.ancestors.some((a) => /^@(media|container|supports)/.test(a)));
  expect(found.length, `no existe la regla base «${selector}»`).toBeGreaterThan(0);
  return new Map(found.flatMap((rule) => [...rule.declarations]));
}

/** Como `base`, pero solo las reglas dentro del at-rule cuyo preludio es exactamente `media`. */
function within(media: string, selector: string): Map<string, string> {
  const found = rulesFor(selector).filter((rule) => rule.ancestors.includes(media));
  expect(found.length, `no existe «${selector}» dentro de «${media}»`).toBeGreaterThan(0);
  return new Map(found.flatMap((rule) => [...rule.declarations]));
}

describe('P1 — motivo de curvas de nivel en pantallas estrechas', () => {
  it('bajo 25rem los dos anillos exteriores se retiran: recortados por `slice` quedaban como arcos sueltos', () => {
    const outer = within('@media (width < 25rem)', '.contour-motif .contour-motif__outer');
    expect(outer.get('display')).toBe('none');
  });

  // Segunda revisión (F3): sin los anillos exteriores el tercero (curva gruesa) queda como borde y sus
  // extremos se apagan casi del todo; bajo 25rem la curva gruesa es el segundo anillo y el tercero, fino.
  it('bajo 25rem la curva gruesa pasa al segundo anillo y la índice se afina', () => {
    expect(within('@media (width < 25rem)', '.contour-motif .contour-motif__narrow-index').get('stroke-width')).toBe('2');
    expect(within('@media (width < 25rem)', '.contour-motif .contour-motif__index').get('stroke-width')).toBe('1');
  });

  it('desde 25rem el segundo anillo no es grueso: su regla solo existe bajo ese ancho', () => {
    const unconditional = rulesFor('.contour-motif .contour-motif__narrow-index').filter(
      (rule) => !rule.ancestors.some((ancestor) => ancestor.startsWith('@media'))
    );
    expect(unconditional).toEqual([]);
  });

  it('desde 25rem los anillos exteriores se ven: la regla que los oculta solo existe bajo ese ancho', () => {
    const unconditional = rulesFor('.contour-motif .contour-motif__outer').filter(
      (rule) => !rule.ancestors.some((ancestor) => ancestor.startsWith('@media'))
    );
    expect(unconditional).toEqual([]);
  });
});

describe('P2 — etiqueta de estado de la cobertura', () => {
  it('el texto sube al tamaño denso (14px) con su interlineado, ya no el de 12px de la etiqueta de operación', () => {
    const state = base('.coverage-notice__state');
    expect(state.get('font-size')).toBe('var(--text-dense)');
    expect(state.get('line-height')).toBe('var(--text-dense--line-height)');
  });

  it('la etiqueta de operación de la fila no cambia: sigue en el tamaño pequeño', () => {
    const operation = base('.result-row__operation');
    expect(operation.get('font-size')).toBe('var(--text-small)');
    expect(operation.get('line-height')).toBe('var(--text-small--line-height)');
  });

  it('el marcador mide 0,5rem (8px)', () => {
    const marker = base('.coverage-notice__state::before');
    expect(marker.get('inline-size')).toBe('0.5rem');
    expect(marker.get('block-size')).toBe('0.5rem');
  });
});

// P3 — el gráfico llena la columna: varios diseños, uno visible por ancho de contenedor.
describe('P3 — el gráfico del histórico llena la columna', () => {
  const LAYOUT_CLASSES = ['compact', 'medium', 'wide', 'large', 'full'] as const;
  const REM = 16;

  /** Diseño visible con un contenedor de `width` px: la regla base y luego cada consulta que ya se cumple. */
  function visibleAt(width: number): string[] {
    const unconditional = (selector: string): string | undefined =>
      rulesFor(selector)
        .filter((rule) => !rule.ancestors.some((a) => /^@(media|container|supports)/.test(a)))
        .map((rule) => rule.declarations.get('display'))
        .filter((value): value is string => value !== undefined)
        .at(-1);
    const display = new Map<string, string>(
      LAYOUT_CLASSES.map((layout) => [
        layout,
        unconditional(`.price-chart__plot--${layout}`) ?? unconditional('.price-chart__plot') ?? 'inline',
      ])
    );
    const queries = RULES.flatMap((rule) => rule.ancestors.filter((a) => a.startsWith('@container')))
      .filter((query, index, all) => all.indexOf(query) === index)
      .map((query) => ({ query, min: Number(/>=\s*([\d.]+)rem/.exec(query)?.[1]) * REM }))
      .filter((entry) => Number.isFinite(entry.min))
      .sort((a, b) => a.min - b.min);
    for (const { query, min } of queries) {
      if (width < min) continue;
      for (const layout of LAYOUT_CLASSES) {
        const inside = rulesFor(`.price-chart__plot--${layout}`).filter((rule) => rule.ancestors.includes(query));
        for (const rule of inside) display.set(layout, rule.declarations.get('display') ?? display.get(layout) ?? 'inline');
      }
    }
    return LAYOUT_CLASSES.filter((layout) => display.get(layout) === 'block');
  }

  it.each([
    [288, 'compact'],
    [415, 'compact'],
    [416, 'medium'],
    [543, 'medium'],
    [544, 'wide'],
    [703, 'wide'],
    [704, 'large'],
    [767, 'large'],
    [768, 'full'],
  ] as const)('con un contenedor de %ipx se ve solo el diseño %s', (width, layout) => {
    expect(visibleAt(width)).toEqual([layout]);
  });

  it('ningún diseño limita su ancho: se estira al 100 % de la columna', () => {
    for (const layout of LAYOUT_CLASSES) {
      for (const rule of rulesFor(`.price-chart__plot--${layout}`)) {
        expect(rule.declarations.has('max-inline-size'), `.price-chart__plot--${layout}`).toBe(false);
      }
    }
    expect(base('.price-chart__plot').get('inline-size')).toBe('100%');
    expect(base('.price-chart__plot').get('block-size')).toBe('auto');
  });

  it('la figura se limita a 48rem, el ancho de la columna de la ficha, que es el del diseño completo', () => {
    expect(base('.price-chart').get('max-inline-size')).toBe('48rem');
    expect(base('.price-chart').get('container-type')).toBe('inline-size');
  });
});

// P6 — columnas del histórico con ancho fijo: las posiciones no dependen del contenido de cada ficha.
describe('P6 — columnas fijas de la tabla del histórico', () => {
  it('table-layout: fixed con un ancho porcentual por columna que suma el 100 %', () => {
    expect(base('.price-history__table').get('table-layout')).toBe('fixed');
    const widths = [1, 2, 3, 4].map((column) => {
      const value = base(`.price-history__table th:nth-child(${String(column)})`).get('inline-size') ?? '';
      expect(value, `columna ${String(column)}`).toMatch(/^\d+%$/);
      return Number.parseInt(value, 10);
    });
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(100);
  });

  it('bajo 30rem la tabla se apila como bloque y el ancho fijo de las cabeceras deja de aplicar', () => {
    expect(within('@media (width < 30rem)', '.price-history__table').get('display')).toBe('block');
  });
});

// P7 — dos detalles de texto.
describe('P7 — fecha de inicio y etiquetas de la lista de fuentes', () => {
  it('la fecha de inicio del aviso de cobertura no se parte entre el día y el mes', () => {
    expect(base('.coverage-notice__date').get('white-space')).toBe('nowrap');
  });

  it('«Último precio más bajo» lleva el mismo trazo discreto que la etiqueta de estado, no el borde de tinta', () => {
    const highlight = base('.source-row__highlight');
    expect(highlight.get('border')).toBe('1px solid var(--rule-control)');
    expect(highlight.get('font-weight')).toBe('400');
    expect(highlight.get('color')).toBe('var(--ink)');
  });

  it('«Más económico» comparte peso y tamaño con la otra etiqueta; solo cambia el color del borde y el fondo', () => {
    const active = base('.source-row__highlight--active');
    expect([...active.keys()].sort()).toEqual(['background-color', 'border-color']);
    expect(active.get('border-color')).toBe('var(--vegetation)');
    expect(active.get('background-color')).toBe('var(--vegetation-wash)');
  });
});

// P8 — cobertura sin resultados: los avisos abren la rejilla de resultados y el mapa empieza en su fila.
describe('P8 — avisos dentro de la rejilla de resultados', () => {
  const WIDE = '@media (width >= 64rem)';
  const WITH_NOTICE = '.search-results:has(> .search-results__notices > :is(.coverage-panel, .coverage-notice)) > .search-results__map';

  it('el envoltorio apila los avisos y el conmutador con 1rem; la rejilla se separa 1rem de los chips', () => {
    const notices = base('.search-results__notices');
    expect(notices.get('display')).toBe('flex');
    expect(notices.get('flex-direction')).toBe('column');
    expect(notices.get('gap')).toBe('1rem');
    // El margen va en la rejilla (no en el envoltorio): así el mapa y el aviso empiezan a la misma altura.
    expect(notices.has('margin-block-start')).toBe(false);
    expect(base('.search-results:has(> .search-results__notices)').get('margin-block-start')).toBe('1rem');
  });

  it('desde 64rem, si el envoltorio solo lleva el conmutador (oculto), la rejilla no se separa de más', () => {
    const rule = within(
      WIDE,
      '.search-results:has(> .search-results__notices):not(:has(> .search-results__notices > :is(.coverage-panel, .coverage-notice)))'
    );
    expect(rule.get('margin-block-start')).toBe('0');
  });

  it('el aviso de cobertura dentro del envoltorio no lleva margen propio: el hueco lo da el envoltorio', () => {
    expect(base('.search-results__notices > .coverage-notice').get('margin')).toBe('0');
    expect(rulesFor('.search-header > .coverage-notice')).toEqual([]);
  });

  it('desde 64rem el envoltorio solo ocupa fila si lleva un aviso de cobertura (el conmutador está oculto)', () => {
    const rule = within(WIDE, '.search-results__notices:not(:has(> .coverage-panel, > .coverage-notice))');
    expect(rule.get('display')).toBe('none');
  });

  it('desde 64rem los avisos y la lista van en la primera columna y el mapa en la segunda', () => {
    expect(within(WIDE, '.search-results__notices').get('grid-column')).toBe('1');
    expect(within(WIDE, '.search-results[data-view] > .search-results__list').get('grid-column')).toBe('1');
    expect(within(WIDE, '.search-results[data-view] > .search-results__map').get('grid-column')).toBe('2');
  });

  it('con un aviso de cobertura la rejilla reparte el alto sobrante a la fila de la lista, no a la del aviso', () => {
    const grid = within(WIDE, '.search-results:has(> .search-results__notices > :is(.coverage-panel, .coverage-notice))');
    expect(grid.get('grid-template-rows')).toBe('auto 1fr');
  });

  it('con un aviso de cobertura el mapa abarca la fila del aviso y la de la lista', () => {
    expect(within(WIDE, WITH_NOTICE).get('grid-row')).toBe('1 / span 2');
    expect(rulesFor(WITH_NOTICE).filter((rule) => !rule.ancestors.includes(WIDE))).toEqual([]);
  });

  it('ya no hay margen suelto entre cabecera y resultados: lo da el envoltorio de avisos', () => {
    expect(rulesFor('.search-header:has(> .coverage-panel, > .coverage-notice) + .search-results')).toEqual([]);
  });

  // Segunda revisión (F1): sin «Ver mapa» (0 resultados) la última fila de chips tocaba el panel vacío.
  // Sin aviso de cobertura delante, el estado vacío lleva su propia separación de 1rem.
  it('sin aviso de cobertura el estado vacío se separa 1rem de los chips; con aviso no se duplica', () => {
    const selector =
      '.search-results:not(:has(> .search-results__notices > :is(.coverage-panel, .coverage-notice))) > .search-results__list > .empty-results';
    expect(base(selector).get('margin-block-start')).toBe('1rem');
  });

  it('el estado vacío usa la misma superficie elevada que el aviso de cobertura (sin fondo propio)', () => {
    const backgrounds = rulesFor('.empty-results').flatMap((rule) => {
      const value = rule.declarations.get('background-color');
      return value === undefined ? [] : [value];
    });
    expect(backgrounds).toEqual(['var(--surface-raised)']);
    expect(base('.coverage-notice').get('color')).toBe(base('.empty-results').get('color'));
    const coverage = rulesFor('.coverage-notice').flatMap((rule) => {
      const value = rule.declarations.get('background-color');
      return value === undefined ? [] : [value];
    });
    expect(coverage).toContain('var(--surface-raised)');
  });
});

// P4 — rejilla de dos columnas de los pares de campos del formulario de revisión.
describe('P4 — rejilla de los campos de la revisión de ?q=', () => {
  it('`criteria-range` es una rejilla de dos columnas iguales con tope de 20rem', () => {
    const range = base('.criteria-range');
    expect(range.get('display')).toBe('grid');
    expect(range.get('grid-template-columns')).toBe('1fr 1fr');
    expect(range.get('max-inline-size')).toBe('20rem');
    expect(range.get('inline-size')).toBe('100%');
  });

  it('la leyenda ocupa las dos columnas y deja 0,375rem antes de los campos', () => {
    const legend = base('.criteria-range > legend');
    expect(legend.get('grid-column')).toBe('1 / -1');
    expect(legend.get('margin-block-end')).toBe('0.375rem');
  });

  it('los tres pares comparten el mismo hueco de 0,5rem (F2: el par de habitaciones usaba 0,75rem)', () => {
    expect(base('.criteria-range').get('gap')).toBe('0.5rem');
  });

  it('los campos de una fila se alinean por abajo: una etiqueta que envuelve no desplaza el campo vecino', () => {
    expect(base('.criteria-range').get('align-items')).toBe('end');
  });

  it('los números llenan su columna: sin hueco muerto a 320px', () => {
    expect(base('.criteria-range input[type=number]').get('inline-size')).toBe('100%');
  });

  it('la etiqueta corta empieza en mayúscula (el texto oculto lleva la minúscula)', () => {
    expect(base('.criteria-range label::first-letter').get('text-transform')).toBe('uppercase');
  });

  it('desaparece la variante secundaria del título de grupo', () => {
    expect(rulesFor('.criteria-group--secondary > h3')).toEqual([]);
  });
});

// P5 — fila de chips: al margen, arriba y en la columna de la lista.
describe('P5 — fila de filtros aplicados', () => {
  it('la fila no pasa de 48rem, la columna de la lista, para que «Quitar todos» no flote sobre el mapa', () => {
    expect(base('.applied-filters').get('max-inline-size')).toBe('48rem');
  });

  it('el recuento mide 2rem de alto como un chip, así que alinea con la primera fila de chips', () => {
    const count = base('.applied-filters__count');
    expect(count.get('min-block-size')).toBe('2rem');
    expect(count.get('line-height')).toBe('2rem');
  });

  it('los enlaces de ordenación no llevan relleno lateral: el texto empieza en el margen', () => {
    expect(base('.sort-presets__link').get('padding-inline')).toBe('0');
    expect(base('.sort-presets__list').get('gap')).toBe('0 1rem');
  });
});

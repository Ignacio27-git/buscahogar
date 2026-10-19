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

/** Las reglas de ese selector (cada lista de selectores se parte en sus partes). */
function rulesFor(selector: string): Rule[] {
  return RULES.filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector));
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
  const LAYOUT_CLASSES = ['compact', 'medium', 'wide', 'full'] as const;
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
    [767, 'wide'],
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

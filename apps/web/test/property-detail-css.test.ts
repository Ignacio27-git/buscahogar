// D.13b (decisión 183, enmienda la 133) — la ficha desde 64rem: solo el resumen de precio es
// sticky; datos y fuentes fluyen con la página. Lee `globals.css` como texto (sin navegador) y
// comprueba la forma de las reglas; la prueba de foco real (WCAG 2.4.11, F110) está en e2e.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarations, findBlock, findBlocks, parseCss, type CssNode } from './helpers/css-tokens';

const ROOT = parseCss(
  readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8')
);
const COMPONENTS = findBlock(ROOT, '@layer components');

const canon = (text: string): string => text.replace(/\s+/g, '');

/** El bloque `@media (width >= 64rem)` que contiene las reglas de la ficha. */
function wideDetail(): CssNode {
  const block = COMPONENTS.children.find(
    (child) =>
      canon(child.prelude) === canon('@media (width >= 64rem)') &&
      child.children.some((rule) => rule.prelude.includes('.property-detail__panel'))
  );
  if (block === undefined) throw new Error('No existe el @media de 64rem de la ficha.');
  return block;
}

/** Declaraciones fusionadas de las reglas del nodo cuya lista de selectores incluye . */
function rule(parent: CssNode, selector: string): Map<string, string> {
  const found = parent.children.filter((child) =>
    child.prelude.split(',').some((part) => canon(part) === canon(selector))
  );
  if (found.length === 0) throw new Error(`No existe la regla "${selector}".`);
  return new Map(found.flatMap((node) => [...declarations(node)]));
}

describe('ficha desde 64rem: solo el precio es sticky (decisión 183)', () => {
  it('el resumen del panel es sticky, opaco y con filete', () => {
    const summary = rule(wideDetail(), '.property-summary--panel');
    expect(summary.get('position')).toBe('sticky');
    expect(summary.get('top')).toBe('0');
    expect(summary.get('background-color')).toBe('var(--surface)');
    expect(summary.get('border-block-end')).toBe('1px solid var(--rule)');
    expect(summary.get('z-index')).toBe('var(--z-sticky-header)');
  });

  it('el panel ya no es una caja con scroll propio ni sticky', () => {
    const panel = rule(wideDetail(), '.property-detail__panel');
    expect(panel.get('align-self')).toBe('stretch');
    for (const property of ['position', 'max-block-size', 'overflow-y', 'border', 'padding']) {
      expect(panel.has(property), property).toBe(false);
    }
  });

  it('.property-header se disuelve (display: contents) para que el resumen cuelgue del panel', () => {
    expect(rule(wideDetail(), '.property-header').get('display')).toBe('contents');
  });
});

describe('foco no oculto por el precio sticky (WCAG 2.4.11)', () => {
  const SELECTOR = 'html:has(.property-detail)';

  it('la reserva suma la altura del precio al desplazamiento base, solo desde 64rem', () => {
    const reserve = rule(wideDetail(), SELECTOR).get('scroll-padding-top') ?? '';
    expect(reserve).toBe('calc(var(--scroll-offset) + 5.5rem + 1px)');
  });

  it('fuera de la media query no hay reserva (nada es sticky por debajo de 64rem)', () => {
    const fuera = COMPONENTS.children.filter((child) => child.prelude.includes('html:has'));
    expect(fuera).toEqual([]);
    const todas = findBlocks(COMPONENTS).filter((node) => node.prelude.includes('html:has'));
    expect(todas).toHaveLength(1);
  });
});

describe('ficha: titulares, histórico y cifras', () => {
  it('«Ubicación» comparte la escala heading-3 de las demás secciones', () => {
    const group = COMPONENTS.children.find((child) => child.prelude.includes('.property-location h2'));
    expect(group?.prelude).toContain('.price-history h2');
    expect(declarations(group as CssNode).get('font-size')).toBe('var(--text-heading-3)');
  });

  it('solo el precio del histórico es nowrap; fuente, variación y cabeceras envuelven', () => {
    const nowrap = findBlocks(COMPONENTS).filter(
      (node) => declarations(node).get('white-space') === 'nowrap' && node.prelude.includes('price-history')
    );
    expect(nowrap.map((node) => node.prelude)).toEqual(['.price-history__table .price-history__price']);
  });

  it('la fecha del histórico usa cifras tabulares', () => {
    const date = rule(COMPONENTS, '.price-history__table .price-history__date');
    expect(date.get('font-variant-numeric')).toBe('tabular-nums');
  });
});

// D.13b — a 320 px la tabla del histórico no cabe ni envolviendo (P7 desbordaba 8px): bajo 30rem
// cada fila se apila con la etiqueta de la columna delante (los roles ARIA van en el marcado).
describe('histórico apilado bajo 30rem (alternativa del diseño)', () => {
  const narrow = (): CssNode => {
    const block = COMPONENTS.children.find(
      (child) =>
        canon(child.prelude) === canon('@media (width < 30rem)') &&
        child.children.some((rule) => rule.prelude.includes('.price-history__table'))
    );
    if (block === undefined) throw new Error('No existe el @media de 30rem del histórico.');
    return block;
  };

  it('tabla, filas y celdas pasan a bloque', () => {
    const table = rule(narrow(), '.price-history__table');
    expect(table.get('display')).toBe('block');
    expect(rule(narrow(), '.price-history__table tr').get('display')).toBe('block');
    expect(rule(narrow(), '.price-history__table td').get('display')).toBe('flex');
  });

  it('cada celda muestra su etiqueta antes del valor', () => {
    const label = rule(narrow(), '.price-history__table td::before');
    expect(label.get('content')).toBe('attr(data-label)');
  });

  it('todos los valores se alinean al final, también el de «Fuente» (texto y insignia)', () => {
    const cell = rule(narrow(), '.price-history__table td');
    expect(cell.get('justify-content')).toBe('flex-end');
    // La etiqueta empuja a la izquierda con su margen automático; el resto se agrupa a la derecha.
    expect(rule(narrow(), '.price-history__table td::before').get('margin-inline-end')).toBe('auto');
  });

  it('todos los valores se alinean al final, también el de «Fuente» (texto y insignia)', () => {
    const cell = rule(narrow(), '.price-history__table td');
    expect(cell.get('justify-content')).toBe('flex-end');
    // La etiqueta empuja a la izquierda con su margen automático; el resto se agrupa a la derecha.
    expect(rule(narrow(), '.price-history__table td::before').get('margin-inline-end')).toBe('auto');
  });

  it('la cabecera visual se oculta sin sacarla del árbol de accesibilidad', () => {
    const head = rule(narrow(), '.price-history__table thead');
    expect(head.get('position')).toBe('absolute');
    expect(head.get('clip-path')).toBe('inset(50%)');
    expect(head.get('display')).toBeUndefined();
  });
});

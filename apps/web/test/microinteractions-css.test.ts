// Paso D.21 (specs ui-microinteractions UI-1..UI-7, decisiones 240-243) — verifica
// `apps/web/src/app/globals.css` como texto: las transiciones de color de los controles, los hover
// nuevos de enlaces, paginador y ordenación, el realce de la fila y el fundido de los avisos.
// Las comprobaciones de navegador viven en `e2e/motion.spec.ts`.
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

function rulesFor(selector: string): Rule[] {
  return RULES.filter((rule) => rule.selector === selector);
}

/** La regla única de ese selector que declara la propiedad (los hover viven aparte, en su media). */
function declaring(selector: string, property: string): Rule {
  const found = rulesFor(selector).filter((rule) => rule.declarations.has(property));
  expect(found, `${selector} { ${property} }`).toHaveLength(1);
  return found[0] as Rule;
}

const FINE_POINTER = (rule: Rule): boolean =>
  rule.ancestors.some((ancestor) => ancestor.includes('(hover: hover)') && ancestor.includes('(pointer: fine)'));

const EASE = 'var(--ease-enter)';
const FEEDBACK_HOVER = 'var(--duration-feedback), var(--duration-hover), var(--duration-hover)';

describe('transiciones de color de los controles (UI-1, S-UI-1, M2)', () => {
  const TABLE: ReadonlyArray<readonly [selector: string, properties: string, durations: string]> = [
    ['button:not(.theme-selector button)', 'transform, background-color, border-color', FEEDBACK_HOVER],
    ['.filter-tray > summary', 'transform, background-color, border-color', FEEDBACK_HOVER],
    ['.applied-filters__chip', 'transform, background-color, border-color', FEEDBACK_HOVER],
    ['.nl-disclosure > summary', 'background-color, border-color', 'var(--duration-hover)'],
    ['a:not(.skip-link)', 'color', 'var(--duration-hover)'],
    ['.sort-presets__link', 'color, border-color', 'var(--duration-hover)'],
    ['.result-row__link', 'background-color', 'var(--duration-hover)'],
  ];

  it.each(TABLE)('«%s» transiciona «%s» con las duraciones emparejadas y --ease-enter', (selector, properties, durations) => {
    const rule = declaring(selector, 'transition-property');
    expect(rule.declarations.get('transition-property')).toBe(properties);
    expect(rule.declarations.get('transition-duration')).toBe(durations);
    expect(rule.declarations.get('transition-timing-function')).toBe(EASE);
    expect(rule.declarations.has('transition')).toBe(false);
    expect(FINE_POINTER(rule)).toBe(false);
  });

  it('los campos, el selector de tema y el enlace de salto no declaran ninguna transición', () => {
    const excluded = RULES.filter(
      (rule) =>
        /(^|[\s,])(input|select|textarea)\b|\.theme-selector|\.skip-link/.test(rule.selector.replace(/:not\([^)]*\)/g, '')) &&
        [...rule.declarations.keys()].some((name) => name.startsWith('transition'))
    );
    expect(excluded.map((rule) => rule.selector)).toEqual([]);
  });

  it('el comentario de los botones ya no dice que el color no transiciona', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).not.toMatch(/El color no transiciona/);
    expect(css).not.toMatch(/Sin\s+transiciones: la fila no se mueve/);
  });
});

describe('hover nuevos de enlaces, paginador y ordenación (UI-1b, S-UI-2b, decisiones 11 y 13)', () => {
  const LINK_HOVER = 'color-mix(in oklab, var(--accent), var(--ink) 12%)';

  it('enlaces y paginador: el hover mezcla el acento con un 12 % de tinta, solo con puntero fino', () => {
    const rule = declaring('a:not(.skip-link):hover', 'color');
    expect(rule.declarations.get('color')).toBe(LINK_HOVER);
    expect(FINE_POINTER(rule)).toBe(true);
    expect([...rule.declarations.keys()]).toEqual(['color']);
  });

  it('el enlace de salto no recibe el hover de enlaces', () => {
    expect(rulesFor('.skip-link:hover')).toEqual([]);
    expect(rulesFor('a:hover')).toEqual([]);
  });

  it('ordenación: un preset no vigente, al pasar el puntero, pone el borde en --rule-control', () => {
    const rule = declaring('.sort-presets__link:not([aria-current=true]):hover', 'border-block-end-color');
    expect(rule.declarations.get('border-block-end-color')).toBe('var(--rule-control)');
    expect(FINE_POINTER(rule)).toBe(true);
    // Misma longhand que el estado vigente, para que ambos estados se comparen entre sí.
    expect(declaring('.sort-presets__link[aria-current=true]', 'border-block-end-color')).toBeDefined();
    // Nunca la tinta del vigente, y el hover no toca otra propiedad.
    expect([...rule.declarations.values()].join(' ')).not.toContain('var(--ink)');
    expect([...rule.declarations.keys()]).toEqual(['border-block-end-color']);
  });

  it('ningún hover nuevo declara una propiedad personalizada', () => {
    const hovers = RULES.filter((rule) => /:hover/.test(rule.selector) && FINE_POINTER(rule));
    expect(hovers.length).toBeGreaterThan(3);
    for (const rule of hovers) {
      expect([...rule.declarations.keys()].filter((name) => name.startsWith('--')), rule.selector).toEqual([]);
    }
  });
});

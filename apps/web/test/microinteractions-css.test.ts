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

describe('realce de la fila de resultado (UI-3, S-UI-5, decisión 241)', () => {
  const GATE_FINE = (rule: Rule): boolean => FINE_POINTER(rule);
  const ALLOWS_MOTION = (rule: Rule): boolean =>
    rule.ancestors.some((ancestor) => ancestor.includes('(prefers-reduced-motion: no-preference)'));

  it('al pasar el puntero fino el fondo de la fila toma --surface-sunken, sin mover la caja', () => {
    const rule = declaring('.result-row__link:hover', 'background-color');
    expect(rule.declarations.get('background-color')).toBe('var(--surface-sunken)');
    expect(GATE_FINE(rule)).toBe(true);
    expect([...rule.declarations.keys()]).toEqual(['background-color']);
  });

  it('la imagen se amplía como mucho a 1,03 y solo con puntero fino y movimiento normal', () => {
    const rule = declaring('.result-row__link:hover .result-row__img', 'transform');
    const match = /^scale\((\d+(?:\.\d+)?)\)$/.exec(rule.declarations.get('transform') ?? '');
    expect(match, rule.declarations.get('transform')).not.toBeNull();
    const factor = Number.parseFloat(match?.[1] ?? 'NaN');
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThanOrEqual(1.03);
    expect(GATE_FINE(rule)).toBe(true);
    expect(ALLOWS_MOTION(rule)).toBe(true);
    expect([...rule.declarations.keys()]).toEqual(['transform']);
  });

  it('el estado base de la imagen transiciona solo transform, en el mismo bloque con las tres condiciones', () => {
    const rule = declaring('.result-row__img', 'transition-property');
    expect(rule.declarations.get('transition-property')).toBe('transform');
    expect(rule.declarations.get('transition-duration')).toBe('var(--duration-hover)');
    expect(rule.declarations.get('transition-timing-function')).toBe(EASE);
    expect(GATE_FINE(rule)).toBe(true);
    expect(ALLOWS_MOTION(rule)).toBe(true);
  });

  it('sin movimiento normal no hay escala: ninguna regla con scale() de la imagen queda fuera del bloque', () => {
    const scaled = RULES.filter(
      (rule) => rule.selector.includes('.result-row__img') && (rule.declarations.get('transform') ?? '').includes('scale(')
    );
    expect(scaled).toHaveLength(1);
    for (const rule of scaled) expect(ALLOWS_MOTION(rule)).toBe(true);
  });

  it('la caja de la imagen recorta lo que se amplía (overflow: hidden)', () => {
    expect(declaring('.result-row__media', 'overflow').declarations.get('overflow')).toBe('hidden');
  });
});

describe('fundido de los avisos (UI-4..UI-6, S-UI-9, S-UI-10, S-UI-14, decisión 242)', () => {
  const FADE_SELECTOR =
    '.coverage-panel:not(:has(> .coverage-notice[role=alert])), .search-header > .coverage-notice:not([role=alert]), .nl-issues, .source-list__warning, .empty-results';

  interface Frames {
    readonly prelude: string;
    readonly layer: string | null;
    readonly frames: ReadonlyArray<{ prelude: string; declarations: ReadonlyArray<readonly [string, string]> }>;
  }

  function keyframes(node: CssNode, layer: string | null = null): Frames[] {
    return node.children.flatMap((child) => {
      const prelude = normalize(child.prelude);
      if (prelude.startsWith('@keyframes')) {
        const frames = child.children.map((frame) => ({
          prelude: normalize(frame.prelude),
          declarations: frame.declarations,
        }));
        return [{ prelude, layer, frames }];
      }
      return keyframes(child, prelude.startsWith('@layer') ? prelude : layer);
    });
  }

  const FRAMES = keyframes(ROOT);

  it('hay un único @keyframes, notice-appear, con un solo fotograma «from» que fija opacity: 0', () => {
    expect(FRAMES).toHaveLength(1);
    const [only] = FRAMES;
    expect(only?.prelude).toBe('@keyframes notice-appear');
    // Sin `to`: el final es el estilo del propio elemento, así que nunca se queda a 0.
    expect(only?.frames).toEqual([{ prelude: 'from', declarations: [['opacity', '0']] }]);
    expect(only?.layer).toBe('@layer components');
  });

  it('una sola regla anima: la lista exacta de avisos, con cuatro longhands y sin relleno de fotogramas', () => {
    const animating = RULES.filter((rule) => [...rule.declarations.keys()].some((name) => name.startsWith('animation')));
    expect(animating.map((rule) => rule.selector)).toEqual([FADE_SELECTOR]);
    const rule = animating[0] as Rule;
    expect(Object.fromEntries(rule.declarations)).toEqual({
      'animation-name': 'notice-appear',
      'animation-duration': 'var(--duration-appear)',
      'animation-timing-function': 'var(--ease-enter)',
      'animation-fill-mode': 'none',
    });
    expect(rule.ancestors).toEqual(['@layer components']);
  });

  it('la regla no toca la opacidad ni la visibilidad de los avisos: sin animación nunca quedan ocultos', () => {
    const rule = declaring(FADE_SELECTOR, 'animation-name');
    expect([...rule.declarations.keys()].filter((name) => /^(opacity|visibility|display)$/.test(name))).toEqual([]);
    for (const other of RULES.filter((candidate) => FADE_SELECTOR.split(', ').includes(candidate.selector))) {
      expect(other.declarations.get('opacity'), other.selector).toBeUndefined();
    }
  });

  it('las alertas jamás animan ni transicionan', () => {
    const alerts = RULES.filter((rule) => /alert/.test(rule.selector.replace(/:not\([^)]*\)/g, '')));
    expect(alerts.length).toBeGreaterThan(0);
    for (const rule of alerts) {
      const motion = [...rule.declarations.keys()].filter((name) => /^(animation|transition)/.test(name));
      expect(motion, rule.selector).toEqual([]);
    }
  });

  it('el selector del fundido excluye las alertas y el panel solo se anima si su aviso no lo es', () => {
    expect(FADE_SELECTOR).toContain('.coverage-panel:not(:has(> .coverage-notice[role=alert]))');
    expect(FADE_SELECTOR).toContain('.search-header > .coverage-notice:not([role=alert])');
    expect(FADE_SELECTOR).not.toContain('nl-review__alert');
  });
});

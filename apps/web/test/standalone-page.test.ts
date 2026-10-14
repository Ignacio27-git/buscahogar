// D.14 (decisión 186) — CSS autónomo de las páginas que no heredan `globals.css`: `global-error`
// (sustituye al layout raíz) y la página 429 (la sirve el proxy, sin React). Copia los valores
// de los tokens de `globals.css`; este test es el espejo que impide que se desvíen en silencio.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';
import { contrast, declarations, findBlock, parseColor, parseCss, type CssNode } from './helpers/css-tokens';

const GLOBALS = parseCss(readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8'));
const STANDALONE = parseCss(STANDALONE_PAGE_CSS);

const DARK_QUERY = '@media (prefers-color-scheme: dark)';
// Tokens que la página autónoma usa de verdad: texto, fondo, borde de control y acento.
const REQUIRED_TOKENS = [
  '--surface',
  '--surface-raised',
  '--surface-sunken',
  '--ink',
  '--ink-muted',
  '--rule',
  '--rule-control',
  '--accent',
  '--focus',
];

function tokens(node: CssNode): Map<string, string> {
  return new Map([...declarations(node)].filter(([name]) => name.startsWith('--')));
}

const lightStandalone = tokens(findBlock(STANDALONE, ':root'));
const darkStandalone = tokens(findBlock(findBlock(STANDALONE, DARK_QUERY), ':root'));
const lightGlobals = tokens(findBlock(GLOBALS, ':root'));
const darkGlobals = tokens(findBlock(GLOBALS, '.dark'));

describe('STANDALONE_PAGE_CSS — paridad de tokens con globals.css (decisión 186)', () => {
  it('declara los tokens necesarios en ambos esquemas', () => {
    for (const name of REQUIRED_TOKENS) {
      expect(lightStandalone.has(name), `${name} claro`).toBe(true);
      expect(darkStandalone.has(name), `${name} oscuro`).toBe(true);
    }
  });

  it('cada token claro coincide con el :root de globals.css', () => {
    expect(lightStandalone.size).toBeGreaterThanOrEqual(REQUIRED_TOKENS.length);
    for (const [name, value] of lightStandalone) {
      expect(value, name).toBe(lightGlobals.get(name));
    }
  });

  it('cada token oscuro coincide con el bloque .dark de globals.css', () => {
    expect(darkStandalone.size).toBeGreaterThanOrEqual(REQUIRED_TOKENS.length);
    for (const [name, value] of darkStandalone) {
      expect(value, name).toBe(darkGlobals.get(name));
    }
  });

  it('claro y oscuro declaran exactamente los mismos nombres', () => {
    expect([...darkStandalone.keys()].sort()).toEqual([...lightStandalone.keys()].sort());
  });
});

describe('STANDALONE_PAGE_CSS — contraste AA en ambos esquemas (D7)', () => {
  const pairs: readonly (readonly [string, string, number])[] = [
    ['--ink', '--surface', 4.5],
    ['--ink-muted', '--surface', 4.5],
    ['--accent', '--surface', 4.5],
    ['--ink', '--surface-raised', 4.5],
    ['--rule-control', '--surface', 3],
  ];

  it.each([
    ['claro', lightStandalone],
    ['oscuro', darkStandalone],
  ] as const)('%s: texto, enlace y borde de control alcanzan su mínimo', (_label, scheme) => {
    for (const [foreground, background, minimum] of pairs) {
      const fg = scheme.get(foreground);
      const bg = scheme.get(background);
      expect(fg).toBeDefined();
      expect(bg).toBeDefined();
      const ratio = contrast(parseColor(fg ?? ''), parseColor(bg ?? ''));
      expect(ratio, `${foreground} sobre ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });
});

describe('STANDALONE_PAGE_CSS — autónomo y sin movimiento', () => {
  it('no carga recursos externos ni usa url(), @import ni animaciones', () => {
    expect(STANDALONE_PAGE_CSS).not.toMatch(/url\(|@import|https?:\/\/|@keyframes|animation|transition/);
  });

  it('fuera de la declaración de tokens solo usa variables para los colores', () => {
    const rules = STANDALONE.children
      .filter((child) => child.prelude !== ':root' && !child.prelude.startsWith('@media'))
      .map((child) => `${child.prelude} { ${[...declarations(child)].map(([n, v]) => `${n}: ${v}`).join('; ')} }`);

    expect(rules.length).toBeGreaterThan(3);
    expect(rules.filter((rule) => /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/.test(rule))).toEqual([]);
  });
});

// D.18 (decisión 219) — franja de cabecera con la marca, fuera del bloque centrado. Espeja la
// cabecera de la app (`site-header.tsx`): `border-b border-rule`, enlace `text-heading-3 text-ink
// no-underline` de 40 px. Sus valores copian `--text-heading-3*` de `@theme static`.
describe('STANDALONE_PAGE_CSS — franja de marca (decisión 219)', () => {
  const header = declarations(findBlock(STANDALONE, '.standalone-header'));
  const brand = declarations(findBlock(STANDALONE, '.standalone-header__brand'));
  const theme = declarations(findBlock(GLOBALS, '@theme static'));

  it('la franja lleva borde inferior con --rule y la marca no se subraya', () => {
    expect(header.get('border-bottom')).toBe('1px solid var(--rule)');
    expect(brand.get('color')).toBe('var(--ink)');
    expect(brand.get('text-decoration-line')).toBe('none');
  });

  it('la marca mide al menos 40 px de alto como el enlace de la cabecera', () => {
    expect(brand.get('min-height')).toBe('2.5rem');
    expect(brand.get('display')).toBe('inline-flex');
  });

  it('espeja los tokens --text-heading-3* de globals.css', () => {
    expect(brand.get('font-size')).toBe(theme.get('--text-heading-3'));
    expect(brand.get('line-height')).toBe(theme.get('--text-heading-3--line-height'));
    expect(brand.get('font-weight')).toBe(theme.get('--text-heading-3--font-weight'));
  });

  it('el bloque centrado deja de ser el body: la franja queda arriba y main centra el resto', () => {
    const body = declarations(findBlock(STANDALONE, 'body'));
    expect(body.get('flex-direction')).toBe('column');
    expect(declarations(findBlock(STANDALONE, '.standalone')).get('margin')).toBe('auto');
    // Ancho útil de 34rem (37rem con el relleno, border-box) y mismo inset de 1.5rem que la franja.
    expect(declarations(findBlock(STANDALONE, '.standalone')).get('max-width')).toBe('37rem');
    expect(declarations(findBlock(STANDALONE, '.standalone')).get('padding')).toBe('1.5rem');
    expect(declarations(findBlock(STANDALONE, '.standalone-header')).get('padding')).toBe('0.5rem 1.5rem');
  });
});

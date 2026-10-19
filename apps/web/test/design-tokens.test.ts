// Paso D.3 (specs design-tokens y base-styles, diseño decisiones 141-143) —
// verifica `apps/web/src/app/globals.css` leyéndolo como texto, sin navegador:
// paridad de los tres bloques de tema, mapeo a utilidades de Tailwind, pares de
// contraste de ambos temas (OKLCH → sRGB de 8 bits → WCAG), escalas estáticas y
// reglas base. La tabla de contraste se fija en un snapshot que se copia a
// `docs/DESIGN-ROADMAP.md`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildContrastTable,
  contrast,
  declarations,
  findBlock,
  findBlocks,
  hasShadowOffset,
  luminance,
  missingNames,
  parseColor,
  parseOklch,
  parseCss,
  toHex,
  type ContrastPair,
  type CssNode,
} from './helpers/css-tokens';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const CSS_PATH = join(SRC_DIR, 'app', 'globals.css');
const RAW_CSS = readFileSync(CSS_PATH, 'utf8');
const ROOT = parseCss(RAW_CSS);

/**
 * Los 18 tokens de color vigentes: los 14 de D.17 (decisión 212: `--success` se retiró por no
 * usarse) más `vegetation` y los tres lavados `vegetation-wash`, `accent-wash` y `danger-wash` (D.19,
 * decisión 231).
 */
const COLOR_TOKENS = [
  'surface',
  'surface-raised',
  'surface-sunken',
  'ink',
  'ink-muted',
  'rule',
  'rule-control',
  'accent',
  'ink-on-accent',
  'focus',
  'danger',
  'selection',
  'hatch',
  'shadow-color',
  'vegetation',
  'vegetation-wash',
  'accent-wash',
  'danger-wash',
] as const;

/**
 * Tokens que NO se exponen como utilidad de color (decisión 141; D.17: `focus` y `danger` solo se usan
 * con `var()`; D.19: el verde, su lavado y el lavado de peligro solo se usan con `var()` en las reglas
 * de estado). `accent-wash` sí es utilidad: lo consumen los chips con `bg-accent-wash`.
 */
const NOT_UTILITIES = [
  'hatch',
  'selection',
  'shadow-color',
  'focus',
  'danger',
  'vegetation',
  'vegetation-wash',
  'danger-wash',
] as const;
const UTILITY_TOKENS = COLOR_TOKENS.filter(
  (name) => !(NOT_UTILITIES as readonly string[]).includes(name)
);

const SURFACES = ['surface', 'surface-raised', 'surface-sunken'] as const;
const WASHES = ['vegetation-wash', 'accent-wash', 'danger-wash'] as const;
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

const PAIRS: ContrastPair[] = [
  ...(['ink', 'ink-muted', 'accent', 'danger'] as const).flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: TEXT_MIN }))
  ),
  { fg: 'ink', bg: 'selection', min: TEXT_MIN },
  { fg: 'ink-on-accent', bg: 'accent', min: TEXT_MIN },
  ...(['rule-control', 'focus'] as const).flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: NON_TEXT_MIN }))
  ),
  { fg: 'hatch', bg: 'surface', min: NON_TEXT_MIN },
  { fg: 'hatch', bg: 'surface-sunken', min: NON_TEXT_MIN },
  // D.19 (decisión 231): el verde de estado y los lavados.
  ...SURFACES.map((bg) => ({ fg: 'vegetation', bg, min: TEXT_MIN })),
  { fg: 'vegetation', bg: 'vegetation-wash', min: TEXT_MIN },
  { fg: 'danger', bg: 'danger-wash', min: TEXT_MIN },
  { fg: 'accent', bg: 'accent-wash', min: TEXT_MIN },
  ...(['ink', 'ink-muted'] as const).flatMap((fg) =>
    WASHES.map((bg) => ({ fg, bg, min: TEXT_MIN }))
  ),
  { fg: 'rule-control', bg: 'accent-wash', min: NON_TEXT_MIN },
];

/** Normaliza un selector: espacios colapsados, comillas fuera. */
function normalizeSelector(selector: string): string {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/['"]/g, '')
    .trim();
}

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/['"]/g, '').trim();
}

function themeBlocks(): { root: CssNode; dark: CssNode; media: CssNode } {
  const root = findBlock(ROOT, ':root');
  const dark = findBlock(ROOT, '.dark');
  const media = findBlock(
    findBlock(ROOT, '@media (prefers-color-scheme: dark)'),
    ':root:not(.light)'
  );
  return { root, dark, media };
}

/** Solo las propiedades personalizadas `--*` de un bloque (color-scheme se ignora). */
function customProperties(node: CssNode): Map<string, string> {
  const result = new Map<string, string>();
  for (const [name, value] of declarations(node)) {
    if (name.startsWith('--')) result.set(name, value);
  }
  return result;
}

function themeValues(node: CssNode): Record<string, string> {
  const props = customProperties(node);
  const result: Record<string, string> = {};
  for (const name of COLOR_TOKENS) {
    const value = props.get(`--${name}`);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('helpers de color y contraste (sanidad, sin globals.css)', () => {
  it('negro sobre blanco da 21:1 y el contraste es simétrico', () => {
    const black = parseColor('#000000');
    const white = parseColor('#ffffff');
    expect(contrast(black, white)).toBeCloseTo(21, 5);
    expect(contrast(white, black)).toBeCloseTo(21, 5);
  });

  it('#767676 sobre blanco da 4,54:1 (referencia WCAG conocida)', () => {
    expect(contrast(parseColor('#767676'), parseColor('#ffffff')).toFixed(2)).toBe('4.54');
  });

  it('la luminancia relativa de blanco es 1 y la de negro 0', () => {
    expect(luminance(parseColor('#ffffff'))).toBeCloseTo(1, 10);
    expect(luminance(parseColor('#000000'))).toBe(0);
  });

  it('oklch(100% 0 0) es #ffffff y oklch(0% 0 0) es #000000', () => {
    expect(toHex(parseColor('oklch(100% 0 0)'))).toBe('#ffffff');
    expect(toHex(parseColor('oklch(0% 0 0)'))).toBe('#000000');
  });

  it('oklch(50% 0 0) es #636363 (gris calculado a mano)', () => {
    expect(toHex(parseColor('oklch(50% 0 0)'))).toBe('#636363');
  });

  it('parseOklch lee un literal OKLCH tal cual y convierte un hex a L, C y H', () => {
    expect(parseOklch('oklch(72% 0.12 252)')).toEqual({ l: 0.72, c: 0.12, h: 252 });
    const white = parseOklch('#ffffff');
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeLessThan(0.001);
    const blue = parseOklch('#1f5fa8');
    expect(blue.l).toBeGreaterThan(0.45);
    expect(blue.l).toBeLessThan(0.55);
    expect(blue.h).toBeGreaterThan(250);
    expect(blue.h).toBeLessThan(260);
    const red = parseOklch('#ff0000');
    expect(red.h).toBeCloseTo(29.23, 0);
  });

  it('acepta primarios con cromaticidad dentro de la tolerancia de 1e-3', () => {
    expect(toHex(parseColor('oklch(62.8% 0.2577 29.23)'))).toBe('#ff0000');
    expect(toHex(parseColor('oklch(45.2% 0.3132 264.05)'))).toBe('#0000ff');
    expect(toHex(parseColor('oklch(86.64% 0.2948 142.5)'))).toBe('#00ff00');
  });

  it('rechaza notaciones fuera del contrato (rgb(), hex de 3 dígitos)', () => {
    expect(() => parseColor('rgb(0, 0, 0)')).toThrow(/rgb\(0, 0, 0\)/);
    expect(() => parseColor('#abc')).toThrow(/#abc/);
  });

  it('rechaza alfa salvo que se permita explícitamente', () => {
    expect(() => parseColor('oklch(24.5% 0.01 232 / 0.14)')).toThrow(/alfa/);
    expect(toHex(parseColor('oklch(0% 0 0 / 0.55)', { allowAlpha: true }))).toBe('#000000');
  });

  it('rechaza un color fuera de gamut sRGB', () => {
    expect(() => parseColor('oklch(70% 0.3 145)')).toThrow(/gamut/);
  });

  it('detecta nombres que faltan en un conjunto', () => {
    expect(missingNames(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(missingNames(['a'], ['a'])).toEqual([]);
  });

  it('un borde de control a 2,9:1 incumple su umbral de 3:1 y uno a 3,03:1 lo cumple', () => {
    const themes = {
      debil: { 'rule-control': '#999999', surface: '#ffffff' },
      firme: { 'rule-control': '#949494', surface: '#ffffff' },
    };
    const pairs: ContrastPair[] = [{ fg: 'rule-control', bg: 'surface', min: 3 }];
    const [debil] = buildContrastTable({ debil: themes.debil }, pairs).rows;
    const [firme] = buildContrastTable({ firme: themes.firme }, pairs).rows;
    expect(debil?.ratio.toFixed(1)).toBe('2.8');
    expect(debil?.pass).toBe(false);
    expect(firme?.pass).toBe(true);
  });

  it('una sombra con desplazamiento cero en ambos ejes es un halo', () => {
    expect(hasShadowOffset('0 0 8px 0 var(--shadow-color)')).toBe(false);
    expect(hasShadowOffset('0 1px 2px 0 var(--shadow-color)')).toBe(true);
    expect(hasShadowOffset('2px 0 4px 0 var(--shadow-color)')).toBe(true);
  });

  it('el analizador de bloques devuelve preludios, declaraciones y sentencias', () => {
    const sample = parseCss(
      `/* nota */ @import 'x'; a { color: red; b { top: 0 } } @media (m) { c { left: 1px } }`
    );
    expect(sample.statements).toEqual(["@import 'x'"]);
    expect(declarations(findBlock(sample, 'a')).get('color')).toBe('red');
    expect(declarations(findBlock(findBlock(sample, 'a'), 'b')).get('top')).toBe('0');
    expect(declarations(findBlock(findBlock(sample, '@media (m)'), 'c')).get('left')).toBe('1px');
    expect(() => findBlock(sample, 'zzz')).toThrow(/zzz/);
  });
});

describe('estructura de globals.css (spec design-tokens)', () => {
  it('la primera sentencia es @import de tailwindcss y existe el custom-variant dark', () => {
    expect(normalizeValue(ROOT.statements[0] ?? '')).toBe('@import tailwindcss');
    expect(ROOT.statements.map(normalizeValue)).toContain(
      '@custom-variant dark (&:where(.dark, .dark *))'
    );
  });

  it(':root declara color-scheme light dark; .light y .dark fijan el suyo', () => {
    const { root, dark } = themeBlocks();
    expect(declarations(root).get('color-scheme')).toBe('light dark');
    expect(declarations(findBlock(ROOT, '.light')).get('color-scheme')).toBe('light');
    expect(declarations(dark).get('color-scheme')).toBe('dark');
  });
});

describe('paridad de los tres bloques de tema (spec «Semantic colour token set»)', () => {
  it('los tres bloques declaran exactamente los 18 tokens de color', () => {
    const { root, dark, media } = themeBlocks();
    for (const [nombre, bloque] of [
      [':root', root],
      ['.dark', dark],
      ['media', media],
    ] as const) {
      const names = [...customProperties(bloque).keys()].map((n) => n.slice(2));
      expect(missingNames(COLOR_TOKENS, names), `falta en ${nombre}`).toEqual([]);
      expect(missingNames(names, COLOR_TOKENS), `sobra en ${nombre}`).toEqual([]);
    }
  });

  it('el bloque @media equivale a .dark propiedad a propiedad', () => {
    const { dark, media } = themeBlocks();
    expect([...customProperties(media)].sort()).toEqual([...customProperties(dark)].sort());
  });

  it('el tema oscuro se deriva en OKLCH y su acento es más claro que el claro', () => {
    const { root, dark } = themeBlocks();
    const darkValues = themeValues(dark);
    for (const name of COLOR_TOKENS) {
      expect(darkValues[name], `--${name} oscuro`).toMatch(/^oklch\(/);
    }
    const lightAccent = luminance(parseColor(themeValues(root)['accent'] ?? ''));
    const darkAccent = luminance(parseColor(darkValues['accent'] ?? ''));
    expect(darkAccent).toBeGreaterThan(lightAccent);
  });

  it('el alfa solo aparece en --shadow-color', () => {
    const { root, dark } = themeBlocks();
    for (const bloque of [root, dark]) {
      const values = themeValues(bloque);
      for (const name of COLOR_TOKENS) {
        const tieneAlfa = /\/\s*[\d.]+\s*\)/.test(values[name] ?? '');
        expect(tieneAlfa, `--${name}`).toBe(name === 'shadow-color');
      }
    }
  });
});

// D.19 (decisión 231) — paleta cálida. Los rangos son la envolvente comprobable de la spec; los valores
// exactos salen de los pares de contraste.
describe('paleta cálida (D.19, spec «Warm light palette» y «Composed warm dark palette»)', () => {
  const light = (): Record<string, string> => themeValues(themeBlocks().root);
  const dark = (): Record<string, string> => themeValues(themeBlocks().dark);
  const lch = (values: Record<string, string>, name: string): ReturnType<typeof parseOklch> =>
    parseOklch(values[name] ?? '');
  const WARM = { min: 40, max: 110 };

  it('el papel claro está entre L 0,97 y 0,98, con croma y matiz cálido', () => {
    const paper = lch(light(), 'surface');
    expect(paper.l).toBeGreaterThanOrEqual(0.97);
    expect(paper.l).toBeLessThanOrEqual(0.98);
    expect(paper.c).toBeGreaterThan(0);
    expect(paper.h).toBeGreaterThanOrEqual(WARM.min);
    expect(paper.h).toBeLessThanOrEqual(WARM.max);
  });

  it('surface-raised es más claro que el papel y surface-sunken más oscuro', () => {
    expect(lch(light(), 'surface-raised').l).toBeGreaterThanOrEqual(0.985);
    expect(lch(light(), 'surface-raised').l).toBeGreaterThan(lch(light(), 'surface').l);
    expect(lch(light(), 'surface-sunken').l).toBeLessThan(lch(light(), 'surface').l);
  });

  it('la tinta clara es cálida (croma > 0 y matiz cálido) en lugar de azul grisáceo', () => {
    const ink = lch(light(), 'ink');
    expect(ink.c).toBeGreaterThan(0);
    expect(ink.h).toBeGreaterThanOrEqual(WARM.min);
    expect(ink.h).toBeLessThanOrEqual(WARM.max);
  });

  it('el acento sigue siendo azul en los tres bloques (único color interactivo)', () => {
    const { root, dark: darkBlock, media } = themeBlocks();
    for (const block of [root, darkBlock, media]) {
      for (const name of ['accent', 'focus'] as const) {
        const { h } = lch(themeValues(block), name);
        expect(h, `--${name}`).toBeGreaterThanOrEqual(240);
        expect(h, `--${name}`).toBeLessThanOrEqual(270);
      }
    }
  });

  it('las superficies oscuras son carbón casi neutro con matiz cálido (L < 0,30, 0 < C <= 0,02)', () => {
    for (const name of SURFACES) {
      const surface = lch(dark(), name);
      expect(surface.l, name).toBeLessThan(0.3);
      expect(surface.c, name).toBeGreaterThan(0);
      expect(surface.c, name).toBeLessThanOrEqual(0.02);
      expect(surface.h, name).toBeGreaterThanOrEqual(WARM.min);
      expect(surface.h, name).toBeLessThanOrEqual(WARM.max);
    }
  });

  it('la tinta oscura es más clara que la superficie y cálida', () => {
    const ink = lch(dark(), 'ink');
    expect(ink.l).toBeGreaterThan(lch(dark(), 'surface').l);
    expect(ink.c).toBeGreaterThan(0);
    expect(ink.h).toBeGreaterThanOrEqual(WARM.min);
    expect(ink.h).toBeLessThanOrEqual(WARM.max);
  });

  it('el acento oscuro es más claro que el claro', () => {
    expect(lch(dark(), 'accent').l).toBeGreaterThan(lch(light(), 'accent').l);
  });

  it('--vegetation es verde (matiz 130-170), distinto del acento, en los dos temas', () => {
    for (const values of [light(), dark()]) {
      const green = lch(values, 'vegetation');
      expect(green.h).toBeGreaterThanOrEqual(130);
      expect(green.h).toBeLessThanOrEqual(170);
      expect(Math.abs(green.h - lch(values, 'accent').h)).toBeGreaterThan(60);
    }
  });

  it('cada lavado es un tinte de croma bajo (<= 0,04) del matiz de su color base', () => {
    const base = {
      'vegetation-wash': 'vegetation',
      'accent-wash': 'accent',
      'danger-wash': 'danger',
    };
    for (const values of [light(), dark()]) {
      for (const [wash, parent] of Object.entries(base)) {
        const tint = lch(values, wash);
        expect(tint.c, wash).toBeGreaterThan(0);
        expect(tint.c, wash).toBeLessThanOrEqual(0.04);
        expect(Math.abs(tint.h - lch(values, parent).h), wash).toBeLessThanOrEqual(15);
      }
    }
  });

  it('un lavado queda por debajo del papel en claro y por encima de la superficie en oscuro', () => {
    for (const wash of WASHES) {
      expect(lch(light(), wash).l, wash).toBeLessThan(lch(light(), 'surface').l);
      expect(lch(dark(), wash).l, wash).toBeGreaterThan(lch(dark(), 'surface').l);
    }
  });

  it('el siena sigue siendo solo de trama: ni lavado de trama ni utilidad de hatch', () => {
    expect(COLOR_TOKENS as readonly string[]).not.toContain('hatch-wash');
    expect(RAW_CSS).not.toContain('--color-hatch');
    expect(RAW_CSS).not.toContain('hatch-wash');
  });
});

describe('contraste WCAG por tema (spec «Contrast thresholds»)', () => {
  // Perezoso: si globals.css no tiene los bloques, falla cada `it` y no la colección.
  function table(): ReturnType<typeof buildContrastTable> {
    const { root, dark } = themeBlocks();
    return buildContrastTable({ claro: themeValues(root), oscuro: themeValues(dark) }, PAIRS);
  }

  it('evalúa todos los pares declarados en ambos temas', () => {
    expect(table().rows).toHaveLength(PAIRS.length * 2);
  });

  it('todos los pares cumplen su umbral', () => {
    const fallos = table()
      .rows.filter((row) => !row.pass)
      .map(
        (row) =>
          `${row.theme}: ${row.fg} sobre ${row.bg} = ${row.ratio.toFixed(2)} (mín. ${String(row.min)})`
      );
    expect(fallos).toEqual([]);
  });

  it('la tabla de contraste coincide con el snapshot confirmado', () => {
    expect(table().text).toMatchSnapshot();
  });
});

// D.8b (SMV-26) — la mira de dibujo lleva dos tonos (anillo `accent`, contorno
// `ink-on-accent`) sobre teselas CLARAS en ambos temas; basta con que uno de los dos
// alcance 3:1 contra el color de tesela más claro y el más oscuro habituales.
describe('contraste de la mira sobre teselas claras (SMV-26)', () => {
  const TILE_BACKGROUNDS = ['#f2efe9', '#ffffff'] as const;

  it.each(['claro', 'oscuro'] as const)('tema %s: algún tono de la mira llega a 3:1', (theme) => {
    const { root, dark } = themeBlocks();
    const values = themeValues(theme === 'claro' ? root : dark);
    for (const tile of TILE_BACKGROUNDS) {
      const best = Math.max(
        contrast(parseColor(values['accent'] ?? ''), parseColor(tile)),
        contrast(parseColor(values['ink-on-accent'] ?? ''), parseColor(tile))
      );
      expect(best, `${theme} sobre ${tile}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });
});

// D.11 (decisión 179) — la trama del área aproximada se dibuja sobre teselas claras en los dos
// temas. Cada raya lleva un filete del color de superficie: basta con que `--hatch` o
// `--surface` alcancen 3:1 contra el color de tesela más claro y el más oscuro habituales.
describe('contraste de la trama de ubicación sobre teselas claras (D.11)', () => {
  const TILE_BACKGROUNDS = ['#f2efe9', '#ffffff'] as const;

  it.each(['claro', 'oscuro'] as const)('tema %s: la trama o su filete llega a 3:1', (theme) => {
    const { root, dark } = themeBlocks();
    const values = themeValues(theme === 'claro' ? root : dark);
    for (const tile of TILE_BACKGROUNDS) {
      const best = Math.max(
        contrast(parseColor(values['hatch'] ?? ''), parseColor(tile)),
        contrast(parseColor(values['surface'] ?? ''), parseColor(tile))
      );
      expect(best, `${theme} sobre ${tile}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });
});

describe('mapeo a Tailwind (spec «Tailwind mapping» y «Hatch is not a utility»)', () => {
  const mappedTokens = (): Map<string, string> => declarations(findBlock(ROOT, '@theme inline'));

  it('reinicia la paleta por defecto con --color-*: initial', () => {
    expect(mappedTokens().get('--color-*')).toBe('initial');
  });

  it.each(UTILITY_TOKENS)('--color-%s apunta a var(--%s)', (name) => {
    expect(mappedTokens().get(`--color-${name}`)).toBe(`var(--${name})`);
  });

  it('accent-wash sí es utilidad de color (lo consumen los chips con bg-accent-wash)', () => {
    expect(mappedTokens().get('--color-accent-wash')).toBe('var(--accent-wash)');
    expect(mappedTokens().has('--color-vegetation')).toBe(false);
  });

  it('hatch, selection, shadow-color, focus, danger, vegetation y los lavados de verde y peligro no son utilidades de color', () => {
    expect(NOT_UTILITIES).toHaveLength(8);
    for (const name of NOT_UTILITIES) {
      expect(mappedTokens().has(`--color-${name}`), `--color-${name}`).toBe(false);
    }
  });

  it('D.17: --success y --color-success ya no existen en ningún bloque', () => {
    const { root, dark, media } = themeBlocks();
    for (const bloque of [root, dark, media]) {
      expect(customProperties(bloque).has('--success')).toBe(false);
    }
    expect(mappedTokens().has('--color-success')).toBe(false);
    expect(RAW_CSS).not.toContain('--success');
  });

  it('ninguna entrada de @theme inline referencia --hatch', () => {
    const mapped = mappedTokens();
    expect(mapped.size).toBeGreaterThan(0);
    for (const [, value] of mapped) {
      expect(value).not.toContain('--hatch');
    }
  });

  it('@theme inline solo contiene entradas --color-*', () => {
    const mapped = mappedTokens();
    expect([...mapped.keys()].filter((name) => !name.startsWith('--color-'))).toEqual([]);
    expect(mapped.size).toBeGreaterThan(UTILITY_TOKENS.length);
  });
});

describe('tokens estáticos (spec «Figtree-first stack», «Type roles», «Spacing, radii, shadows, layers»)', () => {
  const staticBlock = (): CssNode => findBlock(ROOT, '@theme static');
  const staticTokens = (): Map<string, string> => declarations(staticBlock());

  // D.19 (decisión 230): Figtree primero y la pila del sistema detrás. `--font-figtree` lo declara la clase
  // `figtree.variable` de `<html>`; el respaldo `system-ui` del `var()` cubre el caso de que no exista.
  it('--font-sans empieza por var(--font-figtree, system-ui) y sigue con la pila del sistema, en @theme static', () => {
    const tokens = staticTokens();
    const value = normalizeValue(tokens.get('--font-sans') ?? '');
    expect(value).toMatch(/^var\(--font-figtree, system-ui\), system-ui, -apple-system, Segoe UI,/);
    expect(value).toMatch(/Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji$/);
    expect(declarations(findBlock(ROOT, '@theme inline')).has('--font-sans')).toBe(false);
  });

  it('sin Figtree la pila sigue siendo válida: lo que sigue al var() es solo el sistema', () => {
    const value = normalizeValue(staticTokens().get('--font-sans') ?? '');
    const withoutFigtree = value.replace(/^var\(--font-figtree, system-ui\), /, '');
    expect(withoutFigtree).toMatch(/^system-ui,/);
    expect(withoutFigtree).not.toContain('figtree');
  });

  it('define los seis roles tipográficos con cuerpo 1rem y denso 0,875rem', () => {
    const tokens = staticTokens();
    expect(tokens.get('--text-*')).toBe('initial');
    expect(tokens.get('--text-body')).toBe('1rem');
    expect(tokens.get('--text-dense')).toBe('0.875rem');
    const small = Number.parseFloat(tokens.get('--text-small') ?? '');
    expect(small).toBeLessThan(0.875);
    const h3 = Number.parseFloat(tokens.get('--text-heading-3') ?? '');
    const h2 = Number.parseFloat(tokens.get('--text-heading-2') ?? '');
    const h1 = Number.parseFloat(tokens.get('--text-heading-1') ?? '');
    expect(1).toBeLessThan(h3);
    expect(h3).toBeLessThan(h2);
    expect(h2).toBeLessThan(h1);
  });

  it('cada rol tipográfico lleva su interlineado', () => {
    const tokens = staticTokens();
    for (const role of ['small', 'dense', 'body', 'heading-3', 'heading-2', 'heading-1']) {
      expect(tokens.get(`--text-${role}--line-height`), role).toBeDefined();
    }
  });

  it('los radios son 0,375rem de control y 0,5rem de panel, sin píldoras (D.19, decisión 232)', () => {
    const tokens = staticTokens();
    expect(tokens.get('--radius-control')).toBe('0.375rem');
    expect(tokens.get('--radius-panel')).toBe('0.5rem');
    expect([...tokens.keys()].filter((name) => name.startsWith('--radius-'))).toEqual([
      '--radius-control',
      '--radius-panel',
    ]);
    expect(RAW_CSS).not.toMatch(/border-radius:\s*(9999px|999px|50%|100vw)/);
  });

  it('la escala z es exactamente map-controls, sticky-header y toast, ascendente', () => {
    const tokens = staticTokens();
    const z = [...tokens].filter(([name]) => name.startsWith('--z-'));
    expect(z.map(([name]) => name)).toEqual(['--z-map-controls', '--z-sticky-header', '--z-toast']);
    const values = z.map(([, value]) => Number.parseInt(value, 10));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1] ?? Number.POSITIVE_INFINITY);
    }
  });

  it('define el desplazamiento de scroll usado por scroll-padding-top', () => {
    const tokens = staticTokens();
    expect(tokens.get('--scroll-offset')).toBeDefined();
  });

  it('cada capa de cada sombra tiene desplazamiento distinto de cero (sin halos)', () => {
    const tokens = staticTokens();
    const shadows = [...tokens].filter(
      ([name]) => name.startsWith('--shadow-') && name !== '--shadow-color'
    );
    expect(shadows.length).toBeGreaterThanOrEqual(2);
    for (const [name, value] of shadows) {
      expect(hasShadowOffset(value), name).toBe(true);
    }
  });

  it('no sobrescribe --spacing (base de 0,25rem de Tailwind)', () => {
    const spacingOverride = /--spacing\s*:/;
    // El patrón detecta una sobrescritura real, así que su ausencia en el fichero significa algo.
    expect('@theme { --spacing: 0.25rem; }').toMatch(spacingOverride);
    expect(RAW_CSS).not.toMatch(spacingOverride);
  });
});

describe('contenedor y enlace de salto (D.5, specs app-shell R6 y R1)', () => {
  const components = (): CssNode => findBlock(ROOT, '@layer components');

  it('--container-page mide 80rem y vive en @theme static', () => {
    expect(declarations(findBlock(ROOT, '@theme static')).get('--container-page')).toBe('80rem');
  });

  it('.skip-link usa solo colores var() y la capa --z-toast', () => {
    const rule = declarations(findBlock(components(), '.skip-link'));
    expect(rule.get('z-index')).toBe('var(--z-toast)');
    for (const property of ['background-color', 'color', 'border']) {
      expect(rule.get(property), property).toContain('var(--');
    }
    expect(rule.get('background-color')).not.toMatch(/#|oklch|rgb/);
    expect(rule.get('color')).not.toMatch(/#|oklch|rgb/);
    expect(rule.get('border')).not.toMatch(/#|oklch|rgb/);
  });

  it('.skip-link queda fuera de pantalla y .skip-link:focus lo restablece', () => {
    expect(declarations(findBlock(components(), '.skip-link')).get('transform')).toBe(
      'translateY(-200%)'
    );
    expect(declarations(findBlock(components(), '.skip-link:focus')).get('transform')).toBe('none');
  });
});

describe('estilos base (spec base-styles)', () => {
  const baseLayer = (): CssNode => findBlock(ROOT, '@layer base');
  const rule = (selector: string): Map<string, string> =>
    declarations(findBlock(baseLayer(), selector));

  it('html fija scroll-padding-top desde el token', () => {
    expect(rule('html').get('scroll-padding-top')).toBe('var(--scroll-offset)');
  });

  it(':focus-visible dibuja un anillo de al menos 2px con --focus y desplazamiento', () => {
    const focus = rule(':focus-visible');
    const outline = focus.get('outline') ?? '';
    const width = Number.parseFloat(/^(\d+(?:\.\d+)?)px/.exec(outline)?.[1] ?? '0');
    expect(width).toBeGreaterThanOrEqual(2);
    expect(outline).toContain('var(--focus)');
    expect(focus.get('outline-offset')).toBeDefined();
  });

  it('body usa fondo, texto y fuente de los tokens', () => {
    const body = rule('body');
    expect(body.get('background-color')).toBe('var(--surface)');
    expect(body.get('color')).toBe('var(--ink)');
    expect(body.get('font-family')).toBe('var(--font-sans)');
  });

  it('::selection y los enlaces salen de los tokens', () => {
    const selection = rule('::selection');
    expect(selection.get('background-color')).toBe('var(--selection)');
    expect(selection.get('color')).toBe('var(--ink)');
    expect(rule('a').get('color')).toBe('var(--accent)');
    expect(rule('a').get('text-decoration-line')).toBe('underline');
  });

  it('inputs de texto, select y textarea tienen fondo, color y borde explícitos', () => {
    const selector = normalizeSelector(
      'input:not([type=radio],[type=checkbox],[type=range],[type=color]), select, textarea'
    );
    const base = baseLayer();
    const preludios = base.children.map((child) => normalizeSelector(child.prelude));
    expect(preludios).toContain(selector);
    const campo = declarations(
      base.children.find((child) => normalizeSelector(child.prelude) === selector) ?? base
    );
    expect(campo.get('background-color')).toBe('var(--surface)');
    expect(campo.get('color')).toBe('var(--ink)');
    expect(campo.get('border')).toContain('var(--rule-control)');
  });

  it('button tiene fondo, color y borde explícitos', () => {
    const boton = rule('button');
    expect(boton.get('background-color')).toBe('var(--surface-raised)');
    expect(boton.get('color')).toBe('var(--ink)');
    expect(boton.get('border')).toContain('var(--rule-control)');
  });

  it('ninguna regla base restila radios ni checkboxes', () => {
    const base = baseLayer();
    const preludios = base.children.map((child) => normalizeSelector(child.prelude));
    // Se descartan las exclusiones `:not(...)`: ahí radio y checkbox aparecen para quedar fuera.
    const sinExclusiones = preludios.map((p) => p.replace(/:not\([^)]*\)/g, ''));
    for (const preludio of sinExclusiones) {
      expect(preludio).not.toMatch(/radio|checkbox/);
    }
    expect(preludios.some((p) => /:not\(\[type=radio\],\s*\[type=checkbox\]/.test(p))).toBe(true);
  });

  it('.leaflet-container aísla su contexto de apilamiento', () => {
    expect(rule('.leaflet-container').get('isolation')).toBe('isolate');
  });

  it('todas las reglas base referencian tokens y no colores literales', () => {
    const literales = findBlocks(baseLayer()).flatMap((node) =>
      [...declarations(node)]
        .filter(([, value]) => /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/.test(value))
        .map(([name, value]) => `${node.prelude} { ${name}: ${value} }`)
    );
    expect(literales).toEqual([]);
  });
});

describe('fuentes sin red (spec «Figtree served same-origin», «License committed»)', () => {
  it('globals.css no contiene http://, https://, @font-face ni url( (comentarios incluidos)', () => {
    expect(RAW_CSS).not.toMatch(/https?:\/\//);
    expect(RAW_CSS).not.toMatch(/@font-face/);
    expect(RAW_CSS).not.toMatch(/url\(/);
  });

  // D.19 (decisión 230): Figtree se autoaloja con `next/font/local` desde un único módulo; nada importa
  // `next/font/google` (que descargaría de un tercero en la compilación) ni carga la fuente por otra vía.
  const FONT_MODULE = join(SRC_DIR, 'fonts', 'figtree.ts');

  it('solo src/fonts/figtree.ts importa next/font, y es next/font/local', () => {
    const files = listSourceFiles(SRC_DIR);
    expect(files.some((file) => file.endsWith('layout.tsx'))).toBe(true);
    const importers = files.filter((file) => /next\/font/.test(readFileSync(file, 'utf8')));
    expect(importers).toEqual([FONT_MODULE]);
    expect(readFileSync(FONT_MODULE, 'utf8')).toMatch(/from 'next\/font\/local'/);
  });

  it('nada en apps/web/src importa next/font/google ni referencia fonts.googleapis', () => {
    const offenders = listSourceFiles(SRC_DIR).filter((file) =>
      /next\/font\/google|fonts\.(googleapis|gstatic)/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('el módulo declara la variable continua 300-900, swap, --font-figtree y el ajuste de respaldo Arial', () => {
    const source = readFileSync(FONT_MODULE, 'utf8');
    expect(source).toContain("src: './figtree-latin-wght-normal.woff2'");
    expect(source).toContain("weight: '300 900'");
    expect(source).toContain("style: 'normal'");
    expect(source).toContain("variable: '--font-figtree'");
    expect(source).toContain("display: 'swap'");
    expect(source).toContain("adjustFontFallback: 'Arial'");
    expect(source).toMatch(/export const figtree\b/);
  });

  it('el woff2 (variable, latin) y la licencia OFL 1.1 están junto al módulo', () => {
    const woff2 = readFileSync(join(SRC_DIR, 'fonts', 'figtree-latin-wght-normal.woff2'));
    expect(woff2.subarray(0, 4).toString('ascii')).toBe('wOF2');
    expect(woff2.length).toBe(20156);
    expect(readFileSync(join(SRC_DIR, 'fonts', 'OFL.txt'), 'utf8')).toContain(
      'SIL OPEN FONT LICENSE Version 1.1'
    );
  });
});

// D.13b (decisión 185) — controles de formulario con un solo relleno, superficies del navegador
// con la paleta y estados :active. El hover con puntero fino lo cubre `hover-gating.test.ts`.
describe('controles base y superficies del navegador (D.13b)', () => {
  const baseLayer = (): CssNode => findBlock(ROOT, '@layer base');
  const components = (): CssNode => findBlock(ROOT, '@layer components');
  const baseRule = (selector: string): Map<string, string> =>
    declarations(findBlock(baseLayer(), selector));
  const controlSelector =
    "input:not([type='radio'], [type='checkbox'], [type='range'], [type='color']), select, textarea";

  it('input, select, textarea y button comparten el relleno 0.5rem 0.75rem', () => {
    expect(baseRule(controlSelector).get('padding')).toBe('0.5rem 0.75rem');
    expect(baseRule('button').get('padding')).toBe('0.5rem 0.75rem');
  });

  it('ni el botón de la caja de texto ni el de criterios redeclaran el relleno', () => {
    const submit = declarations(findBlock(components(), '.criteria-form__submit, .filter-bar__submit'));
    const texto = declarations(findBlock(components(), '.search-text button'));
    expect([...submit.keys(), ...texto.keys()].filter((name) => /^padding/.test(name))).toEqual([]);
  });

  it(':root pinta el cursor y el acento nativo con la paleta', () => {
    expect(baseRule(':root').get('caret-color')).toBe('var(--accent)');
    expect(baseRule(':root').get('accent-color')).toBe('var(--accent)');
  });

  it('scrollbar-color va bajo @supports y solo con tokens', () => {
    const supports = findBlock(baseLayer(), '@supports (scrollbar-color: auto)');
    const value = declarations(findBlock(supports, ':root')).get('scrollbar-color') ?? '';
    expect(value).toMatch(/^var\(--[a-z-]+\) var\(--[a-z-]+\)$/);
  });

  it('button:active tiene estilo de pulsado y el primario mezcla el 12% de tinta (oklab)', () => {
    expect(baseRule('button:active').get('background-color')).toBe('var(--surface-sunken)');
    expect(RAW_CSS).toMatch(/color-mix\(in oklab, var\(--accent\), var\(--ink\) 12%\)/);
    const active = declarations(findBlock(components(), '.criteria-form__submit:active, .filter-bar__submit:active'));
    expect(active.get('background-color')).toContain('color-mix(in oklab');
  });

  it('el resumen de la bandeja tiene :active', () => {
    const active = declarations(findBlock(components(), '.filter-tray > summary:active'));
    expect(active.get('background-color')).toBe('var(--surface-sunken)');
  });
});

// D.13b — ritmo de la cabecera de búsqueda y medida del aviso de cobertura.
describe('cabecera de búsqueda y medida del aviso (D.13b)', () => {
  const components = (): CssNode => findBlock(ROOT, '@layer components');

  it('.search-header apila sus grupos con separación y sin márgenes propios', () => {
    const header = declarations(findBlock(components(), '.search-header'));
    expect(header.get('display')).toBe('flex');
    expect(header.get('flex-direction')).toBe('column');
    expect(header.get('gap')).toBe('1rem');
    expect(declarations(findBlock(components(), '.search-header > *')).get('margin-block')).toBe('0');
  });

  it('el aviso de cobertura mide como mucho 48rem', () => {
    expect(declarations(findBlock(components(), '.coverage-notice')).get('max-inline-size')).toBe('48rem');
  });
});

// D.15 (F10, R13) — la regla `.icon` estaba duplicada (D.13b); una sola definición.
describe('regla .icon (D.15)', () => {
  it('globals.css define el selector .icon exactamente una vez', () => {
    const definiciones = RAW_CSS.match(/^\s*\.icon\s*\{/gm) ?? [];
    expect(definiciones).toHaveLength(1);
  });
});

// D.15 (F3, R8, decisión 195) y D.18 (decisión 223) — el botón del tema activo anuncia «activo» a la
// tecnología de apoyo mediante texto alternativo del contenido generado; la cabecera sigue siendo
// estática (147). Desde D.18 el texto alternativo cuelga del `::after` del span sr-only que lleva el
// nombre («Oscuro, activo» dentro del mismo span, sin espacio colgante), y la señal visible del
// activo es una barra `::before` bajo el icono (un icono no tiene ni peso ni subrayado).
describe('estado del selector de tema (D.15, D.18)', () => {
  const ACTIVOS: readonly (readonly [string, string, string])[] = [
    ['light', ".light .theme-selector [value='light']", ".light .theme-selector [value='light'] .theme-selector__name::after"],
    ['dark', ".dark .theme-selector [value='dark']", ".dark .theme-selector [value='dark'] .theme-selector__name::after"],
    [
      'system',
      ":root:not(.light, .dark) .theme-selector [value='system']",
      ":root:not(.light, .dark) .theme-selector [value='system'] .theme-selector__name::after",
    ],
  ];
  const ruleBody = (selector: string): string => {
    const start = RAW_CSS.indexOf(selector);
    expect(start, selector).toBeGreaterThan(-1);
    return RAW_CSS.slice(start, RAW_CSS.indexOf('}', start));
  };

  it.each(ACTIVOS)('el botón «%s» activo lleva texto alternativo «, activo» en el span del nombre', (_tema, _boton, after) => {
    expect(ruleBody(after)).toContain("content: '' / ', activo'");
  });

  it.each(ACTIVOS)('el botón «%s» activo dibuja una barra ::before de 2px bajo el icono', (_tema, boton) => {
    const body = ruleBody(`${boton}::before`);
    expect(body).toContain("content: ''");
    expect(body).toContain('position: absolute');
    expect(body).toContain('block-size: 2px');
    expect(body).toContain('background-color: var(--ink)');
  });

  it('ya no hay subrayado ni peso 600 en el botón activo (un icono no tiene ninguno)', () => {
    const body = ruleBody(".light .theme-selector [value='light'],");
    expect(body).not.toContain('text-decoration');
    expect(body).not.toContain('font-weight');
    expect(body).toContain('border-color: var(--ink)');
  });

  it('el botón de tema no vuelve a flotar la leyenda: ya no hay regla `.theme-selector legend`', () => {
    expect(RAW_CSS).not.toContain('.theme-selector legend');
  });
});

// D.15 (F5, R10, decisión 197) — la dirección de la fila envuelve en lugar de recortarse con elipsis:
// con el espaciado de texto de WCAG 1.4.12 la elipsis ocultaba parte de la dirección (el e2e
// `a11y-states` lo comprobó en Docker a 320 px antes de este cambio).
describe('dirección de la fila de resultado (D.15)', () => {
  const bloques = findBlocks(parseCss(RAW_CSS)).filter((nodo) => nodo.prelude.trim() === '.result-row__address');

  it('ninguna regla de la dirección usa nowrap ni elipsis', () => {
    expect(bloques.length).toBeGreaterThan(0);
    for (const bloque of bloques) {
      const declaradas = declarations(bloque);
      expect(declaradas.get('white-space')).not.toBe('nowrap');
      expect(declaradas.has('text-overflow')).toBe(false);
    }
  });

  it('una regla de la dirección permite partir palabras largas', () => {
    expect(bloques.some((bloque) => declarations(bloque).get('overflow-wrap') === 'anywhere')).toBe(true);
  });
});

// D.16 (specs motion-tokens MT-1..MT-10 y ui-motion-surfaces UM-1..UM-10, decisiones 205-208) — sustituye a
// la guarda de D.3 que prohibía cualquier token de movimiento. El movimiento es solo CSS con
// tokens: transiciones escritas con longhands y un único interruptor de movimiento reducido.
// D.21 (decisiones 240-243) la estrecha en vez de borrarla: siete tokens, cinco duraciones a 0s,
// color solo en la lista cerrada de controles y un único fundido de opacidad para los avisos.
describe('movimiento (D.16, ampliado en D.21)', () => {
  const MAP_CSS_RAW = readFileSync(join(SRC_DIR, 'components', 'search-map-canvas.css'), 'utf8');
  const STYLESHEETS: Array<[string, string]> = [
    ['globals.css', RAW_CSS],
    ['search-map-canvas.css', MAP_CSS_RAW],
  ];
  const REDUCE = '@media (prefers-reduced-motion: reduce)';
  const ALLOWED_PROPERTIES = ['transform', 'opacity', 'content-visibility'];
  const COLOUR_PROPERTIES = ['color', 'background-color', 'border-color', 'text-decoration-color'];
  const DURATION_TOKENS = [
    '--duration-feedback',
    '--duration-hover',
    '--duration-appear',
    '--duration-panel-enter',
    '--duration-panel-exit',
  ];
  const EASE_TOKENS = ['--ease-enter', '--ease-exit'];

  /**
   * Controles cuyo color puede transicionar (D.21, M2). Selectores normalizados; la lista es cerrada:
   * el enlace de salto, el selector de tema y los campos quedan fuera a propósito.
   */
  const COLOUR_TRANSITION_SELECTORS = [
    'button:not(.theme-selector button)',
    '.filter-tray > summary',
    '.applied-filters__chip',
    '.nl-disclosure > summary',
    'a:not(.skip-link)',
    '.sort-presets__link',
    '.result-row__link',
  ];

  /** Selector exacto de la única regla que anima (D.21, M6): los avisos que aparecen al montarse. */
  const FADE_SELECTOR = [
    ".coverage-panel:not(:has(> .coverage-notice[role='alert']))",
    ".search-results__notices > .coverage-notice:not([role='alert'])",
    '.nl-issues',
    '.source-list__warning',
    '.empty-results',
  ]
    .join(', ')
    .replace(/['"]/g, '');
  /** Las cuatro declaraciones del fundido, ordenadas por nombre. */
  const FADE_DECLARATIONS = [
    ['animation-duration', 'var(--duration-appear)'],
    ['animation-fill-mode', 'none'],
    ['animation-name', 'notice-appear'],
    ['animation-timing-function', 'var(--ease-enter)'],
  ];

  interface Located {
    node: CssNode;
    inReduce: boolean;
  }

  /** Todos los nodos de una hoja, marcando los que cuelgan del bloque de movimiento reducido. */
  function locate(css: string): Located[] {
    const walk = (node: CssNode, inReduce: boolean): Located[] => [
      { node, inReduce },
      ...node.children.flatMap((child) =>
        walk(child, inReduce || child.prelude.replace(/\s+/g, ' ') === REDUCE)
      ),
    ];
    return walk(parseCss(css), false);
  }

  /** Valores (separados por comas de primer nivel) de cada declaración con ese nombre. */
  function entriesOf(css: string, name: string): Array<{ values: string[]; inReduce: boolean }> {
    return locate(css).flatMap(({ node, inReduce }) =>
      node.declarations
        .filter(([property]) => property === name)
        .map(([, value]) => ({
          values: value.split(/,(?![^(]*\))/).map((part) => part.trim()),
          inReduce,
        }))
    );
  }

  const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const toMs = (value: string): number =>
    value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;

  const tokens = (): Map<string, string> =>
    new Map(
      [...declarations(findBlock(ROOT, '@theme static'))].map(([name, value]) => [
        name,
        normalizeValue(value),
      ])
    );

  /** Parte una lista de selectores por las comas de primer nivel (fuera de paréntesis y corchetes). */
  function splitList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of list) {
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth -= 1;
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

  /** Quita los `:not(...)` con paréntesis equilibrados: lo que excluyen no cuenta como objetivo. */
  function stripNot(selector: string): string {
    let result = '';
    for (let index = 0; index < selector.length; index += 1) {
      if (selector.startsWith(':not(', index)) {
        let depth = 0;
        let end = index + 4;
        for (; end < selector.length; end += 1) {
          if (selector[end] === '(') depth += 1;
          if (selector[end] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        index = end;
      } else {
        result += selector.charAt(index);
      }
    }
    return result;
  }

  const MOTION_PROPERTY = /^(-webkit-)?(transition|animation)/;
  const MOTION_SHORTHAND = /^(-webkit-)?(transition|animation)$/;
  const EXCLUDED_TARGET =
    /(^|[\s>+~,(])(input|select|textarea)(?![\w-])|\.theme-selector|:focus-visible|alert/;

  /**
   * Auditoría del movimiento de una hoja (S-MT-4, S-MT-5, S-UI-4, S-UI-9, S-UI-10). Devuelve una
   * descripción por infracción; vacío significa que la hoja cumple. Los autotests de abajo
   * comprueban que cada infracción sintética se detecta.
   */
  function auditMotion(css: string): string[] {
    const found: string[] = [];
    const text = stripComments(css);
    if (/@starting-style|@view-transition/.test(text))
      found.push('@starting-style o @view-transition');
    if (/scroll-behavior\s*:\s*smooth/.test(text)) found.push('scroll suave');

    const nodes = locate(css).map(({ node }) => node);
    const keyframes = nodes.filter((node) => /^@(-webkit-)?keyframes\b/.test(node.prelude));
    if (keyframes.length > 1) found.push('más de un @keyframes');
    for (const frames of keyframes) {
      const [frame] = frames.children;
      const shape =
        frames.prelude === '@keyframes notice-appear' &&
        frames.children.length === 1 &&
        frame?.prelude === 'from' &&
        JSON.stringify(frame.declarations) === JSON.stringify([['opacity', '0']]);
      if (!shape) found.push(`@keyframes ajeno al fundido: «${frames.prelude}»`);
    }

    for (const node of nodes) {
      if (
        node.prelude === '' ||
        node.prelude.startsWith('@') ||
        /^(from|to|\d+%)$/.test(node.prelude)
      ) {
        continue;
      }
      const selector = normalizeSelector(node.prelude);
      const target = stripNot(selector);
      const motion = node.declarations.filter(([name]) => MOTION_PROPERTY.test(name));
      const own = new Map(node.declarations);

      for (const [name] of motion) {
        if (MOTION_SHORTHAND.test(name)) found.push(`atajo ${name} en «${selector}»`);
      }

      // Campos, selector de tema, foco visible y alertas jamás transicionan ni animan (S-UI-4).
      if (EXCLUDED_TARGET.test(target) && motion.length > 0) {
        found.push(`movimiento en una regla excluida: «${selector}»`);
      }
      if (/:focus-visible/.test(target)) {
        for (const [name] of node.declarations) {
          if (COLOUR_PROPERTIES.includes(name))
            found.push(`color en :focus-visible: «${selector}»`);
        }
      }

      const properties = own.has('transition-property')
        ? splitList(own.get('transition-property') ?? '')
        : [];
      for (const property of properties) {
        const colour =
          COLOUR_PROPERTIES.includes(property) &&
          splitList(selector).every((part) => COLOUR_TRANSITION_SELECTORS.includes(part));
        if (!ALLOWED_PROPERTIES.includes(property) && !colour) {
          found.push(`transition-property «${property}» no permitida en «${selector}»`);
        }
      }
      for (const name of ['transition-duration', 'transition-timing-function']) {
        const count = splitList(own.get(name) ?? '').length;
        if (properties.length > 0 && own.has(name) && count !== 1 && count !== properties.length) {
          found.push(`${name} no empareja transition-property en «${selector}»`);
        }
      }

      const animations = node.declarations.filter(([name]) => name.startsWith('animation'));
      if (animations.length > 0) {
        const sorted = [...animations].sort(([a], [b]) => a.localeCompare(b));
        const exact =
          selector === FADE_SELECTOR &&
          JSON.stringify(sorted) === JSON.stringify(FADE_DECLARATIONS);
        if (!exact) found.push(`animation-* fuera de la regla del fundido: «${selector}»`);
      }
    }
    return found;
  }

  describe('tokens (MT-1..MT-3, S-MT-1, S-MT-2)', () => {
    it('declara exactamente los siete tokens con sus valores en @theme static', () => {
      const all = tokens();
      expect(all.get('--duration-feedback')).toBe('100ms');
      expect(all.get('--duration-hover')).toBe('150ms');
      expect(all.get('--duration-appear')).toBe('200ms');
      expect(all.get('--duration-panel-enter')).toBe('250ms');
      expect(all.get('--duration-panel-exit')).toBe('200ms');
      expect(all.get('--ease-enter')).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
      expect(all.get('--ease-exit')).toBe('cubic-bezier(0.3, 0, 1, 1)');
      const motion = [...all.keys()].filter((name) => /^--(ease|animate|duration)/.test(name));
      expect(motion.sort()).toEqual([...DURATION_TOKENS, ...EASE_TOKENS].sort());
    });

    it('no declara --ease-in ni --ease-out (nombres de Tailwind)', () => {
      expect(RAW_CSS.match(/--ease-(in|out)(?![\w-])\s*:/g)).toBeNull();
      expect(RAW_CSS).toMatch(/--ease-enter\s*:/);
    });

    it('las duraciones están en (0, 400] ms y la salida es más corta que la entrada', () => {
      const all = tokens();
      for (const name of DURATION_TOKENS) {
        const ms = toMs(all.get(name) ?? 'NaN');
        expect(ms, name).toBeGreaterThan(0);
        expect(ms, name).toBeLessThanOrEqual(400);
      }
      expect(toMs(all.get('--duration-panel-exit') ?? 'NaN')).toBeLessThan(
        toMs(all.get('--duration-panel-enter') ?? 'NaN')
      );
    });
  });

  describe('movimiento reducido (MT-7, UM-9)', () => {
    it('un bloque sin capa, entre @theme static y @layer base, pone las cinco duraciones a 0s', () => {
      const names = ROOT.children.map((child) => child.prelude.replace(/\s+/g, ' '));
      const reduce = names.indexOf(REDUCE);
      expect(reduce).toBeGreaterThan(-1);
      expect(reduce).toBeGreaterThan(names.indexOf('@theme static'));
      expect(reduce).toBeLessThan(names.indexOf('@layer base'));
      const rule = findBlock(findBlock(ROOT, REDUCE), ':root');
      // Exactamente cinco declaraciones: ninguna duración nueva queda fuera del interruptor.
      expect(rule.declarations).toEqual(DURATION_TOKENS.map((name) => [name, '0s']));
      expect(rule.declarations).toHaveLength(5);
    });
  });

  describe.each(STYLESHEETS)('hoja %s (MT-4..MT-6, S-MT-3..5, S-UM-8)', (_name, css) => {
    it('no usa el atajo `transition`', () => {
      const shorthand = locate(css).flatMap(({ node }) =>
        node.declarations.filter(([property]) => /^(-webkit-)?transition$/.test(property))
      );
      expect(shorthand).toEqual([]);
    });

    it('transition-duration usa solo var(--duration-*) (0s solo en el bloque reducido)', () => {
      for (const { values, inReduce } of entriesOf(css, 'transition-duration')) {
        for (const value of values) {
          const valid = /^var\(--duration-[a-z-]+\)$/.test(value) || (inReduce && value === '0s');
          expect(valid, value).toBe(true);
        }
      }
    });

    it('transition-timing-function usa solo var(--ease-*)', () => {
      for (const { values } of entriesOf(css, 'transition-timing-function')) {
        for (const value of values) expect(value).toMatch(/^var\(--ease-[a-z-]+\)$/);
      }
    });

    it('pasa la auditoría de movimiento (S-MT-4, S-MT-5, S-UI-4, S-UI-9, S-UI-10)', () => {
      expect(auditMotion(css)).toEqual([]);
    });

    it('ninguna transición anima block-size ni height (UM-5)', () => {
      for (const { values } of entriesOf(css, 'transition-property')) {
        expect(values.join(' ')).not.toMatch(/block-size|height/);
      }
    });
  });

  it('el escáner no es decorativo: globals.css declara longhands y un literal sí se detectaría', () => {
    expect(entriesOf(RAW_CSS, 'transition-duration').length).toBeGreaterThanOrEqual(3);
    expect(entriesOf(RAW_CSS, 'transition-property').length).toBeGreaterThanOrEqual(3);
    expect(entriesOf('a { transition-duration: 200ms }', 'transition-duration')[0]?.values).toEqual(
      ['200ms']
    );
  });

  // D.21 (S-UI-9, S-UI-10): globals.css lleva exactamente el fundido, y la auditoría lo acepta.
  it('globals.css declara exactamente un @keyframes (notice-appear) y una regla animation-* con el selector del fundido', () => {
    const nodes = locate(RAW_CSS).map(({ node }) => node);
    expect(nodes.filter((node) => node.prelude.startsWith('@keyframes')).map((node) => node.prelude)).toEqual([
      '@keyframes notice-appear',
    ]);
    const animating = nodes.filter((node) => node.declarations.some(([name]) => name.startsWith('animation')));
    expect(animating.map((node) => normalizeSelector(node.prelude))).toEqual([FADE_SELECTOR]);
  });

  it('el mapa no declara animation* ni @keyframes (S-MT-5, fuera de alcance: decisión 206)', () => {
    const text = stripComments(MAP_CSS_RAW);
    expect(text).not.toMatch(/@keyframes|animation/);
  });

  describe('autotest de la auditoría: cada infracción sintética se detecta', () => {
    const FADE_RULE = `${FADE_SELECTOR} {
      animation-name: notice-appear;
      animation-duration: var(--duration-appear);
      animation-timing-function: var(--ease-enter);
      animation-fill-mode: none;
    }`;
    const FADE_FRAMES = '@keyframes notice-appear { from { opacity: 0; } }';
    const GOOD_COLOUR = `a:not(.skip-link) {
      transition-property: color;
      transition-duration: var(--duration-hover);
      transition-timing-function: var(--ease-enter);
    }`;

    it('acepta el diseño previsto: fundido único y color en un control de la lista', () => {
      expect(auditMotion(`${FADE_FRAMES} ${FADE_RULE} ${GOOD_COLOUR}`)).toEqual([]);
    });

    it.each([
      ['.skip-link { transition-property: color; }', 'transition-property «color»'],
      [
        '.pagination__edge { transition-property: background-color; }',
        'transition-property «background-color»',
      ],
      ['button { transition-property: outline; }', 'transition-property «outline»'],
      ['.x { transition-property: box-shadow; }', 'transition-property «box-shadow»'],
      ['.x { transition-property: all; }', 'transition-property «all»'],
      ['input { transition-property: opacity; }', 'regla excluida'],
      ['select { transition-duration: var(--duration-hover); }', 'regla excluida'],
      ['.theme-selector button { transition-property: transform; }', 'regla excluida'],
      ['.nl-review__alert { transition-property: opacity; }', 'regla excluida'],
      ['a:focus-visible { color: red; }', 'color en :focus-visible'],
      ['a:focus-visible { transition-duration: var(--duration-hover); }', 'regla excluida'],
      ['.x { transition: color 150ms; }', 'atajo transition'],
      ['.x { animation: notice-appear 200ms; }', 'atajo animation'],
      ['.x { animation-name: notice-appear; }', 'animation-* fuera'],
      [
        '.x { transition-property: opacity, transform; transition-duration: var(--duration-hover), var(--duration-hover), var(--duration-hover); }',
        'no empareja',
      ],
      [`${FADE_FRAMES} @keyframes other { from { opacity: 0; } }`, 'más de un @keyframes'],
      [
        '@keyframes notice-appear { from { opacity: 0; transform: translateY(4px); } }',
        '@keyframes ajeno',
      ],
      ['@keyframes notice-appear { from { opacity: 0; } to { opacity: 1; } }', '@keyframes ajeno'],
      ['@keyframes slide { from { opacity: 0; } }', '@keyframes ajeno'],
      ['@starting-style { .x { opacity: 0; } }', '@starting-style'],
      ['@view-transition { navigation: auto; }', '@view-transition'],
      ['html { scroll-behavior: smooth; }', 'scroll suave'],
    ])('detecta «%s»', (css, expected) => {
      expect(auditMotion(css).join('\n')).toContain(expected);
    });

    it('rechaza una regla del fundido con otra declaración o un selector distinto', () => {
      const extra = FADE_RULE.replace('animation-fill-mode: none;', 'animation-fill-mode: both;');
      expect(auditMotion(`${FADE_FRAMES} ${extra}`).join('\n')).toContain('animation-* fuera');
      const other = FADE_RULE.replace('.empty-results {', '.empty-results, .skip-link {');
      expect(auditMotion(`${FADE_FRAMES} ${other}`).join('\n')).toContain('animation-* fuera');
    });
  });

  describe('sin utilidades de movimiento de Tailwind en los componentes (MT-4)', () => {
    const MOTION_CLASS = /^(transition(-.+)?|duration-.+|ease-.+|animate-.+|delay-.+)$/;
    const isMotionClass = (token: string): boolean =>
      MOTION_CLASS.test(token.split(':').pop() ?? token);

    it('el detector reconoce las clases con variante y deja pasar las demás', () => {
      expect(isMotionClass('sm:transition-colors')).toBe(true);
      expect(isMotionClass('duration-200')).toBe(true);
      expect(isMotionClass('hover:animate-spin')).toBe(true);
      expect(isMotionClass('flex')).toBe(false);
    });

    it('ningún className de src/**/*.tsx contiene una', () => {
      const files = listSourceFiles(SRC_DIR).filter((file) => file.endsWith('.tsx'));
      expect(files.length).toBeGreaterThan(0);
      const found: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
          const classes = (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/);
          found.push(...classes.filter(isMotionClass));
        }
      }
      expect(found).toEqual([]);
    });
  });

  describe('pulsación (UM-6, UM-8, UM-10)', () => {
    const SCALE_SELECTORS = [
      'button:not(.theme-selector button):active:not(:focus-visible)',
      '.filter-tray > summary:active:not(:focus-visible)',
      '.applied-filters__chip:active:not(:focus-visible)',
    ];
    const BASE_SELECTORS = [
      'button:not(.theme-selector button)',
      '.filter-tray > summary',
      '.applied-filters__chip',
    ];
    const nodes = (): CssNode[] => locate(RAW_CSS).map(({ node }) => node);
    const ruleFor = (selector: string): CssNode[] =>
      nodes().filter((node) => normalizeSelector(node.prelude) === selector);

    it.each(SCALE_SELECTORS)('«%s» escala entre 0,95 y 0,99', (selector) => {
      const rules = ruleFor(selector);
      expect(rules).toHaveLength(1);
      const transform = declarations(rules[0] as CssNode).get('transform') ?? '';
      const match = /^scale\((0\.\d+)\)$/.exec(transform);
      expect(match, transform).not.toBeNull();
      const factor = Number.parseFloat(match?.[1] ?? 'NaN');
      expect(factor).toBeGreaterThanOrEqual(0.95);
      expect(factor).toBeLessThanOrEqual(0.99);
    });

    // D.21 (S-UI-5, S-UI-15): las tres reglas de pulsación siguen siendo las únicas con
    // :active, y la ampliación de la imagen de la fila es la única otra regla con scale().
    const HOVER_SCALE_SELECTOR = '.result-row__link:hover .result-row__img';

    it('toda regla con scale() es una de las tres de pulsación o la ampliación de la imagen de la fila', () => {
      const scaled = nodes().filter((node) =>
        node.declarations.some(([name, value]) => name === 'transform' && value.includes('scale('))
      );
      expect(scaled.map((node) => normalizeSelector(node.prelude)).sort()).toEqual(
        [...SCALE_SELECTORS, HOVER_SCALE_SELECTOR].sort()
      );
      expect(scaled.filter((node) => /:active/.test(node.prelude))).toHaveLength(SCALE_SELECTORS.length);
    });

    it('la ampliación de la fila va entre (hover: hover), (pointer: fine) y sin movimiento reducido, con factor en (1, 1,03]', () => {
      const ancestors: string[][] = [];
      const walk = (node: CssNode, chain: string[]): void => {
        for (const child of node.children) {
          if (normalizeSelector(child.prelude) === HOVER_SCALE_SELECTOR) ancestors.push(chain);
          walk(child, [...chain, child.prelude.replace(/\s+/g, ' ')]);
        }
      };
      walk(ROOT, []);
      expect(ancestors).toHaveLength(1);
      const media = (ancestors[0] ?? []).join(' ');
      expect(media).toContain('(hover: hover)');
      expect(media).toContain('(pointer: fine)');
      expect(media).toContain('(prefers-reduced-motion: no-preference)');
      const rule = ruleFor(HOVER_SCALE_SELECTOR)[0] as CssNode;
      const transform = declarations(rule).get('transform') ?? '';
      const factor = Number.parseFloat(/^scale\(([\d.]+)\)$/.exec(transform)?.[1] ?? 'NaN');
      expect(factor).toBeGreaterThan(1);
      expect(factor).toBeLessThanOrEqual(1.03);
    });

    // D.21: la pulsación (transform, 100 ms) comparte lista con el color (150 ms), emparejados por posición.
    it.each(BASE_SELECTORS)('«%s» declara el estado base con longhands y tokens', (selector) => {
      const rules = ruleFor(selector).filter((node) =>
        declarations(node).has('transition-property')
      );
      expect(rules).toHaveLength(1);
      const declared = declarations(rules[0] as CssNode);
      expect(declared.get('transition-property')).toBe('transform, background-color, border-color');
      expect(declared.get('transition-duration')).toBe(
        'var(--duration-feedback), var(--duration-hover), var(--duration-hover)'
      );
      expect(declared.get('transition-timing-function')).toBe('var(--ease-enter)');
    });

    it('los botones del selector de tema no escalan ni transicionan (ninguna regla propia)', () => {
      const themeRules = nodes().filter((node) =>
        /\.theme-selector/.test(node.prelude.replace(/:not\([^)]*\)/g, ''))
      );
      expect(themeRules.length).toBeGreaterThan(0);
      for (const rule of themeRules) {
        const names = rule.declarations.map(([name]) => name);
        expect(
          names.filter((name) => /^(transform|transition)/.test(name)),
          rule.prelude
        ).toEqual([]);
      }
    });
  });

  it('sin comentarios obsoletos de «el movimiento llega en D.16» (MT-10)', () => {
    expect(RAW_CSS).not.toMatch(/movimiento llega en D\.16/);
  });
});

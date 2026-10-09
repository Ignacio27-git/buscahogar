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
  parseCss,
  toHex,
  type ContrastPair,
  type CssNode,
} from './helpers/css-tokens';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const CSS_PATH = join(SRC_DIR, 'app', 'globals.css');
const RAW_CSS = readFileSync(CSS_PATH, 'utf8');
const ROOT = parseCss(RAW_CSS);

/** Los 15 tokens de color de la spec design-tokens. */
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
  'success',
  'selection',
  'hatch',
  'shadow-color',
] as const;

/** Tokens que NO se exponen como utilidad de color (decisión 141). */
const NOT_UTILITIES = ['hatch', 'selection', 'shadow-color'] as const;
const UTILITY_TOKENS = COLOR_TOKENS.filter(
  (name) => !(NOT_UTILITIES as readonly string[]).includes(name)
);

const SURFACES = ['surface', 'surface-raised', 'surface-sunken'] as const;
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

const PAIRS: ContrastPair[] = [
  ...(['ink', 'ink-muted', 'accent', 'danger', 'success'] as const).flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: TEXT_MIN }))
  ),
  { fg: 'ink', bg: 'selection', min: TEXT_MIN },
  { fg: 'ink-on-accent', bg: 'accent', min: TEXT_MIN },
  ...(['rule-control', 'focus'] as const).flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: NON_TEXT_MIN }))
  ),
  { fg: 'hatch', bg: 'surface', min: NON_TEXT_MIN },
  { fg: 'hatch', bg: 'surface-sunken', min: NON_TEXT_MIN },
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
  it('los tres bloques declaran exactamente los 15 tokens de color', () => {
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

  it('hatch, selection y shadow-color no son utilidades de color', () => {
    for (const name of NOT_UTILITIES) {
      expect(mappedTokens().has(`--color-${name}`), `--color-${name}`).toBe(false);
    }
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

describe('tokens estáticos (spec «System font stack», «Type roles», «Spacing, radii, shadows, layers»)', () => {
  const staticBlock = (): CssNode => findBlock(ROOT, '@theme static');
  const staticTokens = (): Map<string, string> => declarations(staticBlock());

  it('--font-sans es una pila del sistema declarada en @theme static y no en inline', () => {
    const tokens = staticTokens();
    expect(tokens.get('--font-sans')).toMatch(/^system-ui,/);
    expect(declarations(findBlock(ROOT, '@theme inline')).has('--font-sans')).toBe(false);
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

  it('define los radios de control y panel', () => {
    const tokens = staticTokens();
    expect(tokens.get('--radius-control')).toBeDefined();
    expect(tokens.get('--radius-panel')).toBeDefined();
  });

  it('la escala z es exactamente base, map-controls, sticky-header, overlay y toast, ascendente', () => {
    const tokens = staticTokens();
    const z = [...tokens].filter(([name]) => name.startsWith('--z-'));
    expect(z.map(([name]) => name)).toEqual([
      '--z-base',
      '--z-map-controls',
      '--z-sticky-header',
      '--z-overlay',
      '--z-toast',
    ]);
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

  it('no declara tokens de movimiento (llegan en D.16)', () => {
    const tokens = staticTokens();
    const all = [...tokens.keys(), ...customProperties(ROOT).keys()];
    const motion = all.filter((name) => /^--(ease|animate|duration|default-transition)/.test(name));
    expect(motion).toEqual([]);
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

describe('fuentes sin red (spec «System font stack»)', () => {
  it('globals.css no contiene http://, https://, @font-face ni url( (comentarios incluidos)', () => {
    expect(RAW_CSS).not.toMatch(/https?:\/\//);
    expect(RAW_CSS).not.toMatch(/@font-face/);
    expect(RAW_CSS).not.toMatch(/url\(/);
  });

  it('ningún fichero de apps/web/src importa next/font', () => {
    const files = listSourceFiles(SRC_DIR);
    expect(files.some((file) => file.endsWith('layout.tsx'))).toBe(true);
    const infractores = files.filter((file) => /next\/font/.test(readFileSync(file, 'utf8')));
    expect(infractores).toEqual([]);
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
    const submit = declarations(findBlock(components(), '.criteria-form__submit'));
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
    const active = declarations(findBlock(components(), '.criteria-form__submit:active'));
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

// D.15 (F3, R8, decisión 195) — el botón del tema activo anuncia «activo» a la tecnología de apoyo
// mediante texto alternativo del contenido generado; la cabecera sigue siendo estática (147) y el
// contenido visible no cambia (alternativa vacía a la izquierda de la barra).
describe('estado del selector de tema (D.15)', () => {
  const ACTIVOS: readonly (readonly [string, string])[] = [
    ['light', ".light .theme-selector [value='light']::after"],
    ['dark', ".dark .theme-selector [value='dark']::after"],
    ['system', ":root:not(.light, .dark) .theme-selector [value='system']::after"],
  ];

  it.each(ACTIVOS)('el botón «%s» activo lleva texto alternativo «, activo»', (_tema, selector) => {
    const regla = RAW_CSS.indexOf(selector);
    expect(regla).toBeGreaterThan(-1);
    const bloque = RAW_CSS.slice(regla, RAW_CSS.indexOf('}', regla));
    expect(bloque).toContain("content: '' / ', activo'");
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

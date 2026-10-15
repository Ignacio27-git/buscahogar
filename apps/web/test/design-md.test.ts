// D.17 — `DESIGN.md` y `.impeccable/design.json` describen el sistema visual y se derivan de
// `apps/web/src/app/globals.css`. Este test es el espejo que impide que se desvíen en silencio:
// los valores del frontmatter son idénticos, como texto, a los de la hoja de estilos final.
//
// Sin dependencia de YAML: el frontmatter de DESIGN.md solo usa líneas planas `clave: "valor"` con
// sangrado de dos espacios por nivel, y aquí se lee como mapa de rutas (`colors.primary`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarations, findBlock, findBlocks, parseCss } from './helpers/css-tokens';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DESIGN_MD = readFileSync(`${REPO_ROOT}DESIGN.md`, 'utf8');
const SIDECAR_TEXT = readFileSync(`${REPO_ROOT}.impeccable/design.json`, 'utf8');
const GLOBALS = parseCss(
  readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8')
);

const CANONICAL_SECTIONS = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
];

/** Grupos de primer nivel que admite el esquema de DESIGN.md; movimiento y sombras van al sidecar. */
const FRONTMATTER_GROUPS = [
  'name',
  'description',
  'colors',
  'typography',
  'rounded',
  'spacing',
  'components',
];

/** Nombre en DESIGN.md → nombre del token en `globals.css` (solo difiere el acento: `primary`). */
const COLOR_NAME_MAP: Record<string, string> = {
  surface: 'surface',
  'surface-raised': 'surface-raised',
  'surface-sunken': 'surface-sunken',
  ink: 'ink',
  'ink-muted': 'ink-muted',
  rule: 'rule',
  'rule-control': 'rule-control',
  primary: 'accent',
  'ink-on-accent': 'ink-on-accent',
  focus: 'focus',
  danger: 'danger',
  selection: 'selection',
  hatch: 'hatch',
};

const TYPOGRAPHY_ROLES = ['small', 'dense', 'body', 'heading-3', 'heading-2', 'heading-1'] as const;

function splitDocument(text: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('DESIGN.md no empieza con un frontmatter delimitado por ---');
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' };
}

/** Lee el frontmatter plano: cada hoja `clave: valor` se guarda bajo su ruta completa. */
function parseFlatFrontmatter(frontmatter: string): Map<string, string> {
  const result = new Map<string, string>();
  const path: string[] = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line.trim());
    if (!match) throw new Error(`Línea de frontmatter no plana: ${line}`);
    const depth = indent / 2;
    path.length = depth;
    const key = match[1] ?? '';
    const raw = match[2];
    if (raw === undefined) {
      path.push(key);
      continue;
    }
    const value = /^"(.*)"$|^'(.*)'$/.exec(raw);
    result.set([...path, key].join('.'), value ? (value[1] ?? value[2] ?? '') : raw);
  }
  return result;
}

function cssValues(node: ReturnType<typeof findBlock>): Map<string, string> {
  return declarations(node);
}

const { frontmatter, body } = splitDocument(DESIGN_MD);
const FRONT = parseFlatFrontmatter(frontmatter);
const LIGHT = cssValues(findBlock(GLOBALS, ':root'));
const DARK = cssValues(findBlock(GLOBALS, '.dark'));
const THEME_STATIC = cssValues(findBlock(GLOBALS, '@theme static'));

function required(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Falta «${key}»`);
  return value;
}

describe('DESIGN.md: el sistema visual deriva de globals.css', () => {
  it('el análisis plano del frontmatter lee hojas anidadas y ordena las rutas', () => {
    const parsed = parseFlatFrontmatter(
      ['a: "x"', 'g:', "  k: '1 2'", '  s:', '    p: 600', 'z: "y"'].join('\n')
    );
    expect([...parsed.entries()]).toEqual([
      ['a', 'x'],
      ['g.k', '1 2'],
      ['g.s.p', '600'],
      ['z', 'y'],
    ]);
  });

  it.each(Object.entries(COLOR_NAME_MAP))(
    'color «%s»: claro y oscuro idénticos a --%s de globals.css',
    (name, token) => {
      expect(required(FRONT, `colors.${name}`)).toBe(required(LIGHT, `--${token}`));
      expect(required(FRONT, `colors.${name}-dark`)).toBe(required(DARK, `--${token}`));
    }
  );

  it('no hay más colores que los del mapa (ni uno de más ni uno retirado)', () => {
    const keys = [...FRONT.keys()]
      .filter((key) => key.startsWith('colors.'))
      .map((key) => key.slice('colors.'.length));
    const expected = Object.keys(COLOR_NAME_MAP).flatMap((name) => [name, `${name}-dark`]);
    expect(keys.sort()).toEqual(expected.sort());
  });

  it('el frontmatter solo usa los grupos del esquema y no declara movimiento ni sombras', () => {
    const groups = new Set([...FRONT.keys()].map((key) => key.split('.')[0]));
    expect([...groups].sort()).toEqual([...FRONTMATTER_GROUPS].sort());
  });

  it.each(TYPOGRAPHY_ROLES)(
    'tipografía «%s»: tamaño, interlineado y peso salen de su token --text',
    (role) => {
      expect(required(FRONT, `typography.${role}.fontSize`)).toBe(
        required(THEME_STATIC, `--text-${role}`)
      );
      expect(required(FRONT, `typography.${role}.lineHeight`)).toBe(
        required(THEME_STATIC, `--text-${role}--line-height`)
      );
      const weight = THEME_STATIC.get(`--text-${role}--font-weight`);
      expect(FRONT.get(`typography.${role}.fontWeight`)).toBe(weight ?? '400');
    }
  );

  it('la tipografía del título principal conserva su interlineado negativo y la familia es la pila del sistema', () => {
    expect(required(FRONT, 'typography.heading-1.letterSpacing')).toBe(
      required(THEME_STATIC, '--text-heading-1--letter-spacing')
    );
    for (const role of TYPOGRAPHY_ROLES) {
      expect(required(FRONT, `typography.${role}.fontFamily`)).toBe(
        required(THEME_STATIC, '--font-sans')
      );
    }
  });

  it('radios y ancho de página idénticos a los tokens', () => {
    expect(required(FRONT, 'rounded.control')).toBe(required(THEME_STATIC, '--radius-control'));
    expect(required(FRONT, 'rounded.panel')).toBe(required(THEME_STATIC, '--radius-panel'));
    expect(required(FRONT, 'spacing.page')).toBe(required(THEME_STATIC, '--container-page'));
  });

  it('cada referencia {grupo.token} de un componente apunta a un token declarado', () => {
    const refs = [...FRONT.entries()].filter(
      ([key, value]) => key.startsWith('components.') && /\{[^}]+\}/.test(value)
    );
    expect(refs.length).toBeGreaterThan(5);
    for (const [key, value] of refs) {
      const path = /^\{([^}]+)\}$/.exec(value)?.[1];
      expect(path, `${key} = ${value}`).toBeDefined();
      const target = path ?? '';
      const declared = [...FRONT.keys()].some(
        (name) => name === target || name.startsWith(`${target}.`)
      );
      expect(declared, `${key} apunta a ${target}`).toBe(true);
    }
  });

  it('los ocho encabezados canónicos están en inglés, en orden y sin repetirse', () => {
    const headings = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim());
    expect(headings).toEqual(CANONICAL_SECTIONS);
  });

  it('nombra el Norte creativo y los cuatro colores confirmados', () => {
    expect(body).toContain('**Creative North Star: "La Hoja del Mapa Topográfico"**');
    for (const name of [
      'Azul de hidrografía',
      'Siena de trama',
      'Tinta de plancha',
      'Filete de marco',
    ]) {
      expect(body, name).toContain(name);
    }
  });

  it('no menciona tokens retirados en D.17', () => {
    expect(DESIGN_MD).not.toMatch(/--success|--z-base|--z-overlay/);
    expect(SIDECAR_TEXT).not.toMatch(/--success|--z-base|--z-overlay/);
  });
});

interface Sidecar {
  schemaVersion: number;
  generatedAt: string;
  title: string;
  extensions: {
    colorMeta: Record<
      string,
      { role: string; displayName: string; canonical: string; tonalRamp: string[] }
    >;
    shadows: { name: string; value: string; purpose: string }[];
    motion: { name: string; value: string; purpose: string }[];
    breakpoints: { name: string; value: string }[];
    zScale: { name: string; value: string }[];
    focusRing: { outline: string; offset: string; source: string };
  };
  components: { name: string; kind: string; refersTo?: string; html: string; css: string }[];
  narrative: {
    northStar: string;
    overview: string;
    keyCharacteristics: string[];
    dos: string[];
    donts: string[];
  };
}

const SIDECAR = JSON.parse(SIDECAR_TEXT) as Sidecar;

describe('.impeccable/design.json: sidecar del esquema 2', () => {
  it('declara la versión 2, la fecha y el título', () => {
    expect(SIDECAR.schemaVersion).toBe(2);
    expect(Number.isNaN(Date.parse(SIDECAR.generatedAt))).toBe(false);
    expect(SIDECAR.title).toBe('Design System: Buscahogar');
  });

  it('la metainformación de color cubre cada color claro con una rampa de ocho pasos y su valor canónico', () => {
    const names = Object.keys(COLOR_NAME_MAP);
    expect(Object.keys(SIDECAR.extensions.colorMeta).sort()).toEqual([...names].sort());
    for (const name of names) {
      const meta = SIDECAR.extensions.colorMeta[name];
      expect(meta?.canonical, name).toBe(required(FRONT, `colors.${name}`));
      expect(meta?.tonalRamp, name).toHaveLength(8);
      expect(meta?.displayName.length, name).toBeGreaterThan(0);
    }
  });

  it('sombras: los dos valores son los de --shadow-raised y --shadow-overlay', () => {
    const shadows = new Map(
      SIDECAR.extensions.shadows.map((shadow) => [shadow.name, shadow.value])
    );
    expect(shadows.get('shadow-raised')).toBe(required(THEME_STATIC, '--shadow-raised'));
    expect(shadows.get('shadow-overlay')).toBe(required(THEME_STATIC, '--shadow-overlay'));
    expect(shadows.size).toBe(2);
  });

  it('movimiento: cada token existe en globals.css con el mismo valor', () => {
    expect(SIDECAR.extensions.motion.length).toBe(5);
    for (const token of SIDECAR.extensions.motion) {
      expect(token.value, token.name).toBe(required(THEME_STATIC, `--${token.name}`));
    }
  });

  it('puntos de ruptura 30, 48 y 64 rem y escala z idéntica a los tokens', () => {
    expect(SIDECAR.extensions.breakpoints.map((point) => point.value)).toEqual([
      '30rem',
      '48rem',
      '64rem',
    ]);
    expect(SIDECAR.extensions.zScale.map((layer) => layer.name)).toEqual([
      'z-map-controls',
      'z-sticky-header',
      'z-toast',
    ]);
    for (const layer of SIDECAR.extensions.zScale) {
      expect(layer.value, layer.name).toBe(required(THEME_STATIC, `--${layer.name}`));
    }
  });

  it('anillo de foco: contorno de 2px con el token --focus y separación de 2px', () => {
    expect(SIDECAR.extensions.focusRing.outline).toBe('2px solid var(--focus)');
    expect(SIDECAR.extensions.focusRing.offset).toBe('2px');
    expect(required(LIGHT, '--focus')).toBe(required(FRONT, 'colors.primary'));
  });

  it('componentes: entre cinco y diez, con html y css autocontenidos y clases con prefijo ds-', () => {
    expect(SIDECAR.components.length).toBeGreaterThanOrEqual(5);
    expect(SIDECAR.components.length).toBeLessThanOrEqual(10);
    for (const component of SIDECAR.components) {
      expect(component.html, component.name).toMatch(/class="ds-/);
      expect(component.css, component.name).toContain('.ds-');
    }
  });

  it('la narrativa repite el Norte creativo de DESIGN.md', () => {
    expect(SIDECAR.narrative.northStar).toBe('La Hoja del Mapa Topográfico');
    expect(body).toContain(`**Creative North Star: "${SIDECAR.narrative.northStar}"**`);
    expect(SIDECAR.narrative.keyCharacteristics.length).toBeGreaterThan(2);
    expect(SIDECAR.narrative.dos.length).toBeGreaterThan(2);
    expect(SIDECAR.narrative.donts.length).toBeGreaterThan(2);
  });
});

// D.18: los componentes de este bloque salen de las decisiones 222, 223, 225, 227, 228 y 229. Los
// tamaños de los componentes nuevos son los de la hoja de estilos final.
const SRC = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8');

/** Selectores de un preludio separados por comas de primer nivel, sin espacios ni comillas. */
function selectorList(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of prelude.replace(/\s+/g, '').replace(/['"]/g, '')) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** Todas las reglas (a cualquier profundidad) cuyo preludio coincide, fusionadas en un mapa. */
function ruleValues(prelude: string): Map<string, string> {
  const wanted = prelude.replace(/\s+/g, '').replace(/['"]/g, '');
  const merged = new Map<string, string>();
  for (const node of findBlocks(GLOBALS)) {
    if (selectorList(node.prelude).includes(wanted)) {
      for (const [name, value] of node.declarations) merged.set(name, value);
    }
  }
  return merged;
}

describe('DESIGN.md: componentes de D.18 salen del código enviado', () => {
  it('sort-preset: alto, relleno y tipografía de .sort-presets__link', () => {
    const rule = ruleValues('.sort-presets__link');
    expect(required(FRONT, 'components.sort-preset.height')).toBe(required(rule, 'min-block-size'));
    expect(required(FRONT, 'components.sort-preset.padding')).toBe(
      `0 ${required(rule, 'padding-inline')}`
    );
    expect(required(FRONT, 'components.sort-preset.typography')).toBe('{typography.dense}');
    expect(rule.get('font-size')).toBe('var(--text-dense)');
  });

  it('sort-preset-active: el vigente lleva tinta, peso 600 y barra de 2px en tinta', () => {
    const rule = ruleValues(".sort-presets__link[aria-current='true']");
    expect(rule.get('font-weight')).toBe('600');
    expect(rule.get('border-block-end-color')).toBe('var(--ink)');
    expect(required(FRONT, 'components.sort-preset-active.textColor')).toBe('{colors.ink}');
    expect(ruleValues('.sort-presets__link').get('border-block-end')).toBe('2px solid transparent');
  });

  it('icon-button: 40 × 40 como el botón de tema de la cabecera', () => {
    expect(SRC('components/site-header.tsx')).toContain('min-h-10 min-w-10');
    expect(required(FRONT, 'components.icon-button.height')).toBe('2.5rem');
    expect(required(FRONT, 'components.icon-button.width')).toBe('2.5rem');
    const bar = ruleValues(".light .theme-selector [value='light']::before");
    expect(bar.get('block-size')).toBe('2px');
    expect(bar.get('inset-block-end')).toBe('0.25rem');
  });

  it('disclosure-summary: resumen de la caja de texto con alto de 2,5rem y borde de control', () => {
    const rule = ruleValues('.nl-disclosure > summary');
    expect(required(FRONT, 'components.disclosure-summary.height')).toBe(
      required(rule, 'min-block-size')
    );
    expect(rule.get('border')).toBe('1px solid var(--rule-control)');
    expect(required(FRONT, 'components.disclosure-summary.backgroundColor')).toBe(
      '{colors.surface-raised}'
    );
  });

  it('la franja de las páginas independientes usa el mismo filete y la misma marca que la cabecera', () => {
    const css = SRC('lib/standalone-page.ts');
    expect(css).toContain('.standalone-header { border-bottom: 1px solid var(--rule);');
    expect(css).toContain('font-size: 1.125rem;');
    expect(required(FRONT, 'typography.heading-3.fontSize')).toBe('1.125rem');
    expect(body).toContain('franja');
  });

  it('el texto describe la cabecera de una fila, la ordenación por enlaces y el vacío con una acción', () => {
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).not.toMatch(/único enlace «Buscar»/);
    expect(flat).toContain('botones de icono');
    expect(flat).toContain('Más recientes');
    expect(flat).toContain('aria-current');
    expect(flat).toContain('Describe lo que buscas');
    expect(flat).toContain('Quitar los demás filtros');
    expect(flat).toContain('Quitar todos los filtros');
    expect(flat).toContain('dos SVG');
  });

  it('no queda rastro del pie de zona ni de la leyenda de D.17', () => {
    expect(DESIGN_MD).not.toMatch(/search-results__caption|ZONE_UNAPPLIED|aún sin aplicar/);
    expect(SIDECAR_TEXT).not.toMatch(/search-results__caption|ZONE_UNAPPLIED/);
  });

  it('el sidecar documenta la ordenación y el botón de icono con prefijo ds-', () => {
    const refers = SIDECAR.components.map((component) => component.refersTo);
    expect(refers).toEqual(expect.arrayContaining(['sort-preset', 'icon-button']));
  });
});

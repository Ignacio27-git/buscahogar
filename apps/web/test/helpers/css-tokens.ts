// Paso D.3 (diseño decisiones 141-143) — utilidades puras para verificar
// `globals.css` sin navegador ni PostCSS (este último solo es transitivo y pnpm
// es estricto): un analizador de bloques por profundidad de llaves, conversión
// OKLCH → sRGB de 8 bits con las matrices estándar de OKLab y contraste WCAG.

export interface CssNode {
  /** Texto antes de `{` (vacío en la raíz). */
  readonly prelude: string;
  /** Sentencias sin `:` de propiedad, p. ej. `@import 'tailwindcss'` (sin el `;`). */
  readonly statements: string[];
  /** Declaraciones `propiedad: valor` en orden de aparición. */
  readonly declarations: Array<[string, string]>;
  readonly children: CssNode[];
}

function newNode(prelude: string): CssNode {
  return { prelude, statements: [], declarations: [], children: [] };
}

function flush(node: CssNode, buffer: string): void {
  const text = buffer.replace(/\s+/g, ' ').trim();
  if (text === '') return;
  if (text.startsWith('@')) {
    node.statements.push(text);
    return;
  }
  const colon = text.indexOf(':');
  if (colon === -1) {
    node.statements.push(text);
    return;
  }
  node.declarations.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()]);
}

/**
 * Analiza CSS con llaves anidadas. Quita los comentarios, respeta comillas y
 * paréntesis (un `;` o `{` dentro de ellos no cierra nada) y no valida nada más.
 */
export function parseCss(text: string): CssNode {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = newNode('');
  const stack: CssNode[] = [root];
  let buffer = '';
  let parens = 0;
  let quote: string | null = null;

  for (const char of source) {
    const current = stack[stack.length - 1] ?? root;
    if (quote !== null) {
      buffer += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
      continue;
    }
    if (char === '(') parens += 1;
    if (char === ')') parens -= 1;
    if (parens === 0 && char === '{') {
      const child = newNode(buffer.replace(/\s+/g, ' ').trim());
      current.children.push(child);
      stack.push(child);
      buffer = '';
      continue;
    }
    if (parens === 0 && (char === ';' || char === '}')) {
      flush(current, buffer);
      buffer = '';
      if (char === '}' && stack.length > 1) stack.pop();
      continue;
    }
    buffer += char;
  }
  flush(stack[stack.length - 1] ?? root, buffer);
  return root;
}

/** Forma canónica de un preludio: sin espacios ni comillas. */
function canon(prelude: string): string {
  return prelude.replace(/\s+/g, '').replace(/['"]/g, '');
}

/** Primer hijo directo cuyo preludio coincide; lanza si no existe. */
export function findBlock(parent: CssNode, prelude: string): CssNode {
  const found = parent.children.find((child) => canon(child.prelude) === canon(prelude));
  if (!found) {
    throw new Error(`No existe el bloque "${prelude}" en "${parent.prelude || '(raíz)'}".`);
  }
  return found;
}

/** Todos los descendientes de un nodo (profundidad primero), sin incluirlo. */
export function findBlocks(parent: CssNode): CssNode[] {
  return parent.children.flatMap((child) => [child, ...findBlocks(child)]);
}

/** Declaraciones de un nodo; una propiedad repetida se queda con su último valor. */
export function declarations(node: CssNode): Map<string, string> {
  return new Map(node.declarations);
}

/** Nombres de `expected` que no están en `actual`. */
export function missingNames(expected: readonly string[], actual: readonly string[]): string[] {
  return expected.filter((name) => !actual.includes(name));
}

export interface Rgb {
  /** Canales sRGB de 8 bits. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

/** Tolerancia lineal fuera de [0, 1]: los literales OKLCH llevan 3-4 cifras (decisión 142). */
const GAMUT_TOLERANCE = 1e-3;

function encodeChannel(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/**
 * OKLCH (L en 0-1, C, H en grados) → sRGB de 8 bits. Lanza si algún canal lineal
 * cae fuera de [-1e-3, 1 + 1e-3]; dentro de la tolerancia se recorta a [0, 1].
 */
export function oklchToSrgb8(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const;
  for (const channel of linear) {
    if (channel < -GAMUT_TOLERANCE || channel > 1 + GAMUT_TOLERANCE) {
      throw new Error(
        `oklch(${String(lightness * 100)}% ${String(chroma)} ${String(hue)}) queda fuera del gamut sRGB (canal lineal ${channel.toFixed(4)}).`
      );
    }
  }
  return {
    r: encodeChannel(linear[0]),
    g: encodeChannel(linear[1]),
    b: encodeChannel(linear[2]),
    alpha: 1,
  };
}

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const OKLCH =
  /^oklch\(\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*\)$/i;

/**
 * Admite `#rrggbb` y `oklch(L% C H)`; con `allowAlpha` también `/ alfa`. Cualquier
 * otra notación, el alfa no permitido y los colores fuera de gamut lanzan.
 */
export function parseColor(value: string, options: { allowAlpha?: boolean } = {}): Rgb {
  const text = value.trim();
  const hex = HEX.exec(text);
  if (hex) {
    return {
      r: Number.parseInt(hex[1] ?? '', 16),
      g: Number.parseInt(hex[2] ?? '', 16),
      b: Number.parseInt(hex[3] ?? '', 16),
      alpha: 1,
    };
  }
  const oklch = OKLCH.exec(text);
  if (!oklch) {
    throw new Error(`Color no admitido: "${value}" (solo #rrggbb y oklch(L% C H)).`);
  }
  const alpha = oklch[4] === undefined ? 1 : Number.parseFloat(oklch[4]);
  if (oklch[4] !== undefined && options.allowAlpha !== true) {
    throw new Error(`"${value}" lleva alfa; un token de contraste no puede ser translúcido.`);
  }
  const rgb = oklchToSrgb8(
    Number.parseFloat(oklch[1] ?? '') / 100,
    Number.parseFloat(oklch[2] ?? ''),
    Number.parseFloat(oklch[3] ?? '')
  );
  return { ...rgb, alpha };
}

export function toHex(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa WCAG de un color de 8 bits. */
export function luminance(color: Rgb): number {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
  readonly min: number;
}

export interface ContrastRow {
  readonly theme: string;
  readonly fg: string;
  readonly bg: string;
  readonly fgHex: string;
  readonly bgHex: string;
  readonly ratio: number;
  readonly min: number;
  readonly pass: boolean;
}

/**
 * Evalúa cada par en cada tema (`themes[tema][token]` es el valor CSS) y devuelve
 * las filas y la misma tabla como Markdown, lista para pegar en la documentación.
 */
export function buildContrastTable(
  themes: Readonly<Record<string, Readonly<Record<string, string>>>>,
  pairs: readonly ContrastPair[]
): { rows: ContrastRow[]; text: string } {
  const rows: ContrastRow[] = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const pair of pairs) {
      const fgValue = tokens[pair.fg];
      const bgValue = tokens[pair.bg];
      if (fgValue === undefined) throw new Error(`Falta --${pair.fg} en el tema "${theme}".`);
      if (bgValue === undefined) throw new Error(`Falta --${pair.bg} en el tema "${theme}".`);
      const fg = parseColor(fgValue);
      const bg = parseColor(bgValue);
      const ratio = contrast(fg, bg);
      rows.push({
        theme,
        fg: pair.fg,
        bg: pair.bg,
        fgHex: toHex(fg),
        bgHex: toHex(bg),
        ratio,
        min: pair.min,
        pass: ratio >= pair.min,
      });
    }
  }
  const lines = [
    '| Tema | Primer plano | Fondo | Colores | Ratio | Mínimo | Resultado |',
    '| ---- | ------------ | ----- | ------- | ----- | ------ | --------- |',
    ...rows.map(
      (row) =>
        `| ${row.theme} | ${row.fg} | ${row.bg} | ${row.fgHex} sobre ${row.bgHex} | ${row.ratio.toFixed(2)} | ${String(row.min)} | ${row.pass ? 'cumple' : 'FALLA'} |`
    ),
  ];
  return { rows, text: `${lines.join('\n')}\n` };
}

/** Parte `value` por `separator` ignorando los que quedan dentro de paréntesis. */
function splitTopLevel(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    const splits = depth === 0 && (separator === ',' ? char === ',' : /\s/.test(char));
    if (splits) {
      if (current.trim() !== '') parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/** `true` si todas las capas de la sombra tienen un desplazamiento x o y distinto de cero. */
export function hasShadowOffset(value: string): boolean {
  const layers = splitTopLevel(value, ',');
  return (
    layers.length > 0 &&
    layers.every((layer) => {
      const [x, y] = splitTopLevel(layer, ' ');
      return Number.parseFloat(x ?? '0') !== 0 || Number.parseFloat(y ?? '0') !== 0;
    })
  );
}

export interface Oklch {
  /** Luminosidad de 0 a 1. */
  readonly l: number;
  readonly c: number;
  /** Matiz en grados, de 0 a 360 (0 si el color es acromático). */
  readonly h: number;
}

/**
 * Lee `oklch(L% C H)` tal cual (sin pasar por sRGB de 8 bits, para no perder precisión) o convierte
 * un `#rrggbb` a OKLCH con las matrices estándar de OKLab. Lanza con cualquier otra notación.
 */
export function parseOklch(value: string): Oklch {
  const literal = OKLCH.exec(value.trim());
  if (literal) {
    return {
      l: Number.parseFloat(literal[1] ?? '') / 100,
      c: Number.parseFloat(literal[2] ?? ''),
      h: Number.parseFloat(literal[3] ?? ''),
    };
  }
  const { r, g, b } = parseColor(value);
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bb);
  const hue = chroma < 1e-4 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
  return { l: lightness, c: chroma, h: hue < 0 ? hue + 360 : hue };
}

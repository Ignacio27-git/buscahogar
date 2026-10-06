// D.8a (spec SMV-16, SMV-18, decisión 164) — guarda de CSS, leyendo `globals.css`
// como texto (sin navegador), igual que `filter-tray-css.test.ts`. Fija que la
// visibilidad de lista y mapa la deciden solo las media queries: las reglas que
// ocultan un panel viven FUERA de la consulta de 64rem, y la que lo vuelve a
// mostrar y oculta el conmutador, DENTRO.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');

// Texto del bloque `{ ... }` que empieza en la primera llave tras `start`.
function blockAfter(css: string, start: number): string {
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error('Llaves sin cerrar en globals.css');
}

const WIDE_QUERY = '@media (width >= 64rem)';
const HIDE_LIST = /\.search-results\[data-view='map'\]\s*>\s*\.search-results__list\s*\{[^}]*display:\s*none/g;
const HIDE_MAP = /\.search-results\[data-view='list'\]\s*>\s*\.search-results__map\s*\{[^}]*display:\s*none/g;
const HIDE_TOGGLE = /\.view-toggle\s*\{[^}]*display:\s*none/g;

// Bloques `@media (width >= 64rem)` que contienen `.search-results`.
function wideBlocks(): string[] {
  const blocks: string[] = [];
  let from = CSS.indexOf(WIDE_QUERY);
  while (from !== -1) {
    const block = blockAfter(CSS, from);
    if (block.includes('.search-results')) blocks.push(block);
    from = CSS.indexOf(WIDE_QUERY, from + WIDE_QUERY.length);
  }
  return blocks;
}

describe('CSS de la vista dividida — SMV-16', () => {
  it('las reglas que ocultan un panel existen una vez y fuera de toda media query de 64rem', () => {
    const wide = wideBlocks();
    expect(wide).toHaveLength(1);
    expect(CSS.match(HIDE_LIST)).toHaveLength(1);
    expect(CSS.match(HIDE_MAP)).toHaveLength(1);
    const outside = CSS.replace(wide[0] ?? '', '');
    expect(outside.match(HIDE_LIST)).toHaveLength(1);
    expect(outside.match(HIDE_MAP)).toHaveLength(1);
  });

  it('desde 64rem se vuelven a mostrar ambos paneles con la misma especificidad y el conmutador se oculta', () => {
    const wide = wideBlocks()[0] ?? '';
    expect(wide).toMatch(/\.search-results\[data-view\]\s*>\s*\.search-results__(list|map)/);
    expect(wide).toMatch(/display:\s*(block|flex)/);
    expect(wide.match(HIDE_TOGGLE)).toHaveLength(1);
    expect(CSS.replace(wide, '').match(HIDE_TOGGLE)).toBeNull();
    expect(wide).toContain('grid-template-columns: minmax(0, 48rem) minmax(20rem, 1fr)');
  });

  it('el mapa es sticky y de altura adaptable solo en la vista ancha', () => {
    const wide = wideBlocks()[0] ?? '';
    expect(wide).toContain('position: sticky');
    expect(wide).toContain('top: var(--scroll-offset)');
    expect(wide).toContain('100dvh');
  });
});

describe('CSS del marco del mapa — SMV-18', () => {
  const frameStart = CSS.search(/\.search-map__frame\s*\{/);

  it('el marco usa el hairline y la superficie de la hoja, sin sombra ni colores nuevos', () => {
    expect(frameStart).toBeGreaterThan(-1);
    const frame = blockAfter(CSS, frameStart);
    expect(frame).toContain('border: 1px solid var(--rule)');
    expect(frame).toContain('background-color: var(--surface)');
    expect(frame).not.toMatch(/box-shadow|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('por debajo de 64rem el marco tiene una altura acotada por el viewport (sin 520px fijos)', () => {
    const frame = blockAfter(CSS, frameStart);
    expect(frame).toContain('block-size: clamp(20rem, 70dvh, 40rem)');
    expect(CSS).not.toContain('520px');
  });

  it('sin JavaScript (scripting: none) se oculta el marcador de carga y se muestra el aviso del noscript', () => {
    const start = CSS.indexOf('@media (scripting: none)');
    expect(start).toBeGreaterThan(-1);
    const block = blockAfter(CSS, start);
    expect(block).toMatch(/\.search-map__loading\s*\{[^}]*display:\s*none/);
    expect(block).toMatch(/\.search-map__frame\s*\{[^}]*display:\s*grid/);
  });
});

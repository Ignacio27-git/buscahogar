// D.6b (spec mobile-filter-tray, S18, decisión 153) — guarda de CSS, leyendo
// `globals.css` como texto (sin navegador). La regla que oculta el resumen de
// la bandeja debe vivir SOLO dentro de `@supports selector(::details-content)`:
// fuera de él, un navegador sin soporte perdería el control y la bandeja
// cerrada quedaría inalcanzable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { declarations, findBlock, findBlocks, parseCss, type CssNode } from './helpers/css-tokens';

const CSS = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');

// Devuelve el texto del bloque `{ ... }` que empieza en la primera llave tras
// `start`, con las llaves equilibradas.
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

// D.22 (decisión 268): la regla solo vale para la bandeja SIN el modificador de despliegue de la
// portada, que queda plegada a todos los anchos.
const HIDE_RULE =
  /\.filter-tray:not\(\.filter-tray--disclosure\)\s*>\s*summary\s*\{[^}]*display:\s*none/g;

describe('CSS de la bandeja — S18', () => {
  it('la regla que oculta el resumen existe', () => {
    expect(CSS.match(HIDE_RULE)).toHaveLength(1);
  });

  it('esa regla aparece solo dentro de @supports selector(::details-content)', () => {
    const supportsStart = CSS.indexOf('@supports selector(::details-content)');
    expect(supportsStart).toBeGreaterThan(-1);
    const supportsBlock = blockAfter(CSS, supportsStart);
    expect(supportsBlock.match(HIDE_RULE)).toHaveLength(1);
    expect(CSS.replace(supportsBlock, '').match(HIDE_RULE)).toBeNull();
  });

  it('y solo desde 64rem de ancho', () => {
    const supportsBlock = blockAfter(CSS, CSS.indexOf('@supports selector(::details-content)'));
    const mediaStart = supportsBlock.indexOf('@media (width >= 64rem)');
    expect(mediaStart).toBeGreaterThan(-1);
    expect(blockAfter(supportsBlock, mediaStart).match(HIDE_RULE)).toHaveLength(1);
  });
});

// D.16 (specs ui-motion-surfaces UM-1..UM-5, UM-9, S-UM-1, S-MT-7; decisiones 205-208) — el desvanecido de la
// bandeja vive en el mismo `@supports`, solo por debajo de 64rem y antes del bloque de escritorio.
describe('CSS de la bandeja — movimiento (D.16)', () => {
  const root = parseCss(CSS);
  const supports = (): CssNode =>
    findBlock(findBlock(root, '@layer components'), '@supports selector(::details-content)');
  const mobile = (): CssNode => findBlock(supports(), '@media (width < 64rem)');
  const desktop = (): CssNode => findBlock(supports(), '@media (width >= 64rem)');

  it('el bloque < 64rem está dentro del @supports y antes del de >= 64rem', () => {
    const preludes = supports().children.map((child) => child.prelude.replace(/\s+/g, ' '));
    expect(preludes).toContain('@media (width < 64rem)');
    expect(preludes.indexOf('@media (width < 64rem)')).toBeLessThan(
      preludes.indexOf('@media (width >= 64rem)')
    );
  });

  it('cerrada: opacity 0, translateY(-0.5rem), salida con --ease-exit y allow-discrete', () => {
    const closed = declarations(findBlock(mobile(), '.filter-tray::details-content'));
    expect(closed.get('opacity')).toBe('0');
    expect(closed.get('transform')).toBe('translateY(-0.5rem)');
    expect(closed.get('transition-property')).toBe('opacity, transform, content-visibility');
    expect(closed.get('transition-duration')).toBe('var(--duration-panel-exit)');
    expect(closed.get('transition-timing-function')).toBe('var(--ease-exit)');
    expect(closed.get('transition-behavior')).toBe('allow-discrete');
  });

  it('abierta: opacity 1, sin transform, entrada con --ease-enter y --duration-panel-enter', () => {
    const open = declarations(findBlock(mobile(), '.filter-tray[open]::details-content'));
    expect(open.get('opacity')).toBe('1');
    expect(open.get('transform')).toBe('none');
    expect(open.get('transition-duration')).toBe('var(--duration-panel-enter)');
    expect(open.get('transition-timing-function')).toBe('var(--ease-enter)');
  });

  it('desde 64rem el contenido sigue visible y sin opacidad, transform ni transición', () => {
    const names = findBlocks(desktop()).flatMap((rule) => rule.declarations.map(([name]) => name));
    expect(names).toContain('content-visibility');
    expect(names.filter((name) => /^(opacity|transform|transition)/.test(name))).toEqual([]);
  });

  // D.22 (decisión 268, A7): en la portada la bandeja plegada anima su contenido también desde 64rem,
  // con los mismos valores que bajo 64rem. Vive en el @supports, entre el bloque móvil y el de escritorio.
  it('la bandeja con el modificador anima al abrir y cerrar a todos los anchos', () => {
    const preludes = supports().children.map((child) => child.prelude.replace(/\s+/g, ' '));
    const closedRule = findBlock(supports(), '.filter-tray--disclosure::details-content');
    const openRule = findBlock(supports(), '.filter-tray--disclosure[open]::details-content');
    const mobileClosed = declarations(findBlock(mobile(), '.filter-tray::details-content'));
    const mobileOpen = declarations(findBlock(mobile(), '.filter-tray[open]::details-content'));
    expect(declarations(closedRule)).toEqual(mobileClosed);
    expect(declarations(openRule)).toEqual(mobileOpen);
    expect(mobileClosed.size).toBeGreaterThan(3);
    expect(preludes.indexOf('.filter-tray--disclosure::details-content')).toBeGreaterThan(
      preludes.indexOf('@media (width < 64rem)')
    );
    expect(preludes.indexOf('.filter-tray--disclosure::details-content')).toBeLessThan(
      preludes.indexOf('@media (width >= 64rem)')
    );
  });

  it('desde 64rem el contenido siempre desplegado y la fila completa solo valen sin el modificador', () => {
    const hidden = findBlock(desktop(), '.filter-tray:not(.filter-tray--disclosure) > summary');
    expect(declarations(hidden).get('display')).toBe('none');
    const content = findBlock(desktop(), '.filter-tray:not(.filter-tray--disclosure)::details-content');
    expect(declarations(content).get('content-visibility')).toBe('visible');
    const toolbar = findBlock(findBlock(root, '@layer components'), '@media (width >= 64rem)');
    expect(
      declarations(findBlock(toolbar, '.search-toolbar > .filter-tray:not(.filter-tray--disclosure)')).get(
        'flex-basis'
      )
    ).toBe('100%');
  });

  it('el movimiento de la bandeja no aparece fuera del @supports (UM-4)', () => {
    const outside = CSS.replace(blockAfter(CSS, CSS.indexOf('@supports selector(::details-content)')), '');
    expect(outside).not.toMatch(/::details-content[^{]*\{[^}]*(opacity|transition)/);
    expect(CSS).toContain('::details-content');
  });
});

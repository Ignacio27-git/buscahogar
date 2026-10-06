// D.6b (spec mobile-filter-tray, S18, decisión 153) — guarda de CSS, leyendo
// `globals.css` como texto (sin navegador). La regla que oculta el resumen de
// la bandeja debe vivir SOLO dentro de `@supports selector(::details-content)`:
// fuera de él, un navegador sin soporte perdería el control y la bandeja
// cerrada quedaría inalcanzable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

const HIDE_RULE = /\.filter-tray\s*>\s*summary\s*\{[^}]*display:\s*none/g;

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

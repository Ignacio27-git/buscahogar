// D.13b (decisión 185) — todo :hover se escribe en CSS bajo `(hover: hover) and (pointer: fine)`.
// La variante `hover:` de Tailwind v4 solo comprueba `(hover: hover)`, así que no se usa en src.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseCss, type CssNode } from './helpers/css-tokens';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const GATE = '(hover:hover)and(pointer:fine)';

function sourceFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

/** Selectores con `:hover` que no cuelgan de la media query combinada. */
function ungatedHovers(node: CssNode, gated = false): string[] {
  return node.children.flatMap((child) => {
    const prelude = child.prelude.replace(/\s+/g, '');
    const isGate = prelude.startsWith('@media') && prelude.includes(GATE);
    if (prelude.startsWith('@')) return ungatedHovers(child, gated || isGate);
    const own = prelude.includes(':hover') && !gated ? [child.prelude] : [];
    return [...own, ...ungatedHovers(child, gated)];
  });
}

describe('el analizador de hover sin puerta (sanidad)', () => {
  it('detecta un :hover suelto y acepta el que está bajo la media query combinada', () => {
    const suelto = parseCss('@layer components { a:hover { color: red } }');
    const puerta = parseCss(
      '@layer components { @media (hover: hover) and (pointer: fine) { a:hover { color: red } } }'
    );
    const soloHover = parseCss('@media (hover: hover) { a:hover { color: red } }');
    expect(ungatedHovers(suelto)).toEqual(['a:hover']);
    expect(ungatedHovers(puerta)).toEqual([]);
    expect(ungatedHovers(soloHover)).toEqual(['a:hover']);
  });
});

describe('hover solo con puntero fino (decisión 185)', () => {
  it('ningún .ts/.tsx de src usa la variante hover: de Tailwind', () => {
    const files = sourceFiles(SRC_DIR, /\.(ts|tsx)$/);
    expect(files.length).toBeGreaterThan(10);
    const infractores = files.filter((file) => /\bhover:/.test(readFileSync(file, 'utf8')));
    expect(infractores).toEqual([]);
  });

  it.each(['app/globals.css', 'components/search-map-canvas.css'])(
    '%s: todo :hover va dentro de (hover: hover) and (pointer: fine)',
    (relative) => {
      const css = readFileSync(join(SRC_DIR, relative), 'utf8');
      expect(css).toMatch(/:hover/);
      expect(ungatedHovers(parseCss(css))).toEqual([]);
    }
  );
});

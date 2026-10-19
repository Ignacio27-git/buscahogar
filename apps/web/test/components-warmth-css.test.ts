// D.20 (decisión 235 y siguientes) — forma de las reglas que dan calidez a los componentes. Lee
// `globals.css` como texto (sin navegador); las medidas reales viven en `e2e/components-warmth.spec.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarations, findBlock, findBlocks, parseCss, type CssNode } from './helpers/css-tokens';

const RAW_CSS = readFileSync(
  fileURLToPath(new URL('../src/app/globals.css', import.meta.url)),
  'utf8'
);
const ROOT = parseCss(RAW_CSS);
const COMPONENTS = findBlock(ROOT, '@layer components');

const canon = (text: string): string => text.replace(/\s+/g, '');

/** Declaraciones fusionadas de las reglas de nivel superior de `@layer components` para el selector. */
function rule(selector: string): Map<string, string> {
  const found = COMPONENTS.children.filter((child) =>
    child.prelude.split(',').some((part) => canon(part) === canon(selector))
  );
  if (found.length === 0) throw new Error(`No existe la regla "${selector}".`);
  return new Map(found.flatMap((node) => [...declarations(node)]));
}

function declaredTokens(): string[] {
  const theme: CssNode[] = findBlocks(ROOT).filter((node) => node.prelude.startsWith('@theme'));
  return theme.flatMap((node) => node.declarations.map(([name]) => name));
}

describe('motivo de curvas de nivel (S1.2)', () => {
  it('el trazo sale del token --rule, que existe', () => {
    const motif = rule('.contour-motif');
    expect(motif.get('stroke')).toBe('var(--rule)');
    expect(declaredTokens()).toContain('--color-rule');
  });

  it('está fuera del flujo, no recibe puntero y no reserva espacio', () => {
    const motif = rule('.contour-motif');
    expect(motif.get('position')).toBe('absolute');
    expect(motif.get('pointer-events')).toBe('none');
    expect(motif.get('fill')).toBe('none');
  });

  it('el trazo no escala con la caja y la curva índice es más gruesa', () => {
    expect(rule('.contour-motif path').get('vector-effect')).toBe('non-scaling-stroke');
    expect(rule('.contour-motif .contour-motif__index').get('stroke-width')).toBe('2');
  });

  it('la cabecera es el contenedor de posición y el h1 pinta por encima sin z-index', () => {
    expect(rule('.search-header').get('position')).toBe('relative');
    const title = rule('.search-header > h1');
    expect(title.get('position')).toBe('relative');
    expect(title.has('z-index')).toBe(false);
  });

  it('no añade url( ni http en el CSS (INV-5)', () => {
    expect(RAW_CSS).not.toMatch(/url\(/);
    expect(RAW_CSS).not.toMatch(/https?:\/\//);
  });
});

// Paso D.21, lote de pulido tras la revisión (decisión 14 del mantenedor, grupos P1-P8) — forma de las
// reglas de `globals.css` que corrigen los detalles hallados en las capturas. Lee el CSS como texto
// (sin navegador); las medidas reales (geometría, estilos calculados) viven en
// `e2e/components-warmth.spec.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseCss, type CssNode } from './helpers/css-tokens';

const CSS_PATH = join(fileURLToPath(new URL('../src', import.meta.url)), 'app', 'globals.css');
const ROOT = parseCss(readFileSync(CSS_PATH, 'utf8'));

interface Rule {
  /** Selector normalizado: espacios colapsados y comillas fuera. */
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
  /** Preludios de los at-rules que envuelven la regla, del más externo al más interno. */
  readonly ancestors: readonly string[];
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').replace(/['"]/g, '').trim();

function collect(node: CssNode, ancestors: readonly string[] = []): Rule[] {
  return node.children.flatMap((child) => {
    const prelude = normalize(child.prelude);
    if (prelude.startsWith('@')) return collect(child, [...ancestors, prelude]);
    return [{ selector: prelude, declarations: new Map(child.declarations), ancestors }, ...collect(child, ancestors)];
  });
}

const RULES = collect(ROOT);

/** Las reglas de ese selector (cada lista de selectores se parte en sus partes). */
function rulesFor(selector: string): Rule[] {
  return RULES.filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector));
}

/** Declaraciones fusionadas de las reglas del selector que no están bajo ningún at-rule de media/hover. */
function base(selector: string): Map<string, string> {
  const found = rulesFor(selector).filter((rule) => !rule.ancestors.some((a) => a.startsWith('@media')));
  expect(found.length, `no existe la regla base «${selector}»`).toBeGreaterThan(0);
  return new Map(found.flatMap((rule) => [...rule.declarations]));
}

/** Como `base`, pero solo las reglas dentro del at-rule cuyo preludio es exactamente `media`. */
function within(media: string, selector: string): Map<string, string> {
  const found = rulesFor(selector).filter((rule) => rule.ancestors.includes(media));
  expect(found.length, `no existe «${selector}» dentro de «${media}»`).toBeGreaterThan(0);
  return new Map(found.flatMap((rule) => [...rule.declarations]));
}

describe('P1 — motivo de curvas de nivel en pantallas estrechas', () => {
  it('bajo 25rem los dos anillos exteriores se retiran: recortados por `slice` quedaban como arcos sueltos', () => {
    const outer = within('@media (width < 25rem)', '.contour-motif .contour-motif__outer');
    expect(outer.get('display')).toBe('none');
  });

  it('desde 25rem los anillos exteriores se ven: la regla que los oculta solo existe bajo ese ancho', () => {
    const unconditional = rulesFor('.contour-motif .contour-motif__outer').filter(
      (rule) => !rule.ancestors.some((ancestor) => ancestor.startsWith('@media'))
    );
    expect(unconditional).toEqual([]);
  });
});

describe('P2 — etiqueta de estado de la cobertura', () => {
  it('el texto sube al tamaño denso (14px) con su interlineado, ya no el de 12px de la etiqueta de operación', () => {
    const state = base('.coverage-notice__state');
    expect(state.get('font-size')).toBe('var(--text-dense)');
    expect(state.get('line-height')).toBe('var(--text-dense--line-height)');
  });

  it('la etiqueta de operación de la fila no cambia: sigue en el tamaño pequeño', () => {
    const operation = base('.result-row__operation');
    expect(operation.get('font-size')).toBe('var(--text-small)');
    expect(operation.get('line-height')).toBe('var(--text-small--line-height)');
  });

  it('el marcador mide 0,5rem (8px)', () => {
    const marker = base('.coverage-notice__state::before');
    expect(marker.get('inline-size')).toBe('0.5rem');
    expect(marker.get('block-size')).toBe('0.5rem');
  });
});

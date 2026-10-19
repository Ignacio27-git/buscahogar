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

/** Como `rule`, pero dentro del `@media (width >= 48rem)` que contiene la fila de resultado. */
function wideRule(selector: string): Map<string, string> {
  const block = COMPONENTS.children.find(
    (child) =>
      canon(child.prelude) === canon('@media (width >= 48rem)') &&
      child.children.some((inner) => inner.prelude.includes('.result-row__price'))
  );
  if (block === undefined) throw new Error('No existe el @media de 48rem de la fila de resultado.');
  const found = block.children.filter((child) =>
    child.prelude.split(',').some((part) => canon(part) === canon(selector))
  );
  if (found.length === 0) throw new Error(`No existe la regla ancha "${selector}".`);
  return new Map(found.flatMap((node) => [...declarations(node)]));
}

describe('motivo de curvas de nivel (S1.2)', () => {
  it('el trazo sale de tokens existentes y se equilibra por tema: claro --rule-control atenuado, oscuro --rule', () => {
    const motif = rule('.contour-motif');
    expect(motif.get('stroke')).toBe('var(--rule-control)');
    const opacity = Number(motif.get('opacity'));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    expect(declaredTokens()).toContain('--color-rule');
    expect(declaredTokens()).toContain('--color-rule-control');

    const dark = rule('.dark .contour-motif');
    expect(dark.get('stroke')).toBe('var(--rule)');
    expect(dark.get('opacity')).toBe('1');

    const system = COMPONENTS.children.find(
      (child) =>
        canon(child.prelude) === canon('@media (prefers-color-scheme: dark)') &&
        child.children.some((inner) => inner.prelude.includes('.contour-motif'))
    );
    expect(system).toBeDefined();
    const systemRule = system?.children.find((inner) =>
      canon(inner.prelude) === canon(':root:not(.light, .dark) .contour-motif')
    );
    expect(systemRule).toBeDefined();
    const systemDeclarations = declarations(systemRule as CssNode);
    expect(systemDeclarations.get('stroke')).toBe('var(--rule)');
    expect(systemDeclarations.get('opacity')).toBe('1');
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

describe('fila de resultado: precio dominante (S2.4, decisión 236)', () => {
  it('el precio sube de peso en todos los anchos y no cambia de tamaño', () => {
    const base = rule('.result-row__price');
    expect(base.get('font-weight')).toBe('var(--text-heading-1--font-weight)');
    expect(base.get('letter-spacing')).toBe('var(--text-heading-1--letter-spacing)');
    expect(base.get('font-size')).toBe('var(--text-heading-3)');
    expect(base.get('line-height')).toBe('var(--text-heading-3--line-height)');

    const wide = wideRule('.result-row__price');
    expect(wide.get('font-weight')).toBe('var(--text-heading-1--font-weight)');
    expect(wide.get('font-size')).toBe('var(--text-heading-2)');
    expect(wide.get('line-height')).toBe('var(--text-heading-2--line-height)');
  });

  it('«Precio no disponible» no hereda el peso ni el espaciado del precio', () => {
    for (const missing of [rule('.result-row__price--missing'), wideRule('.result-row__price--missing')]) {
      expect(missing.get('font-weight')).toBe('400');
      expect(missing.get('letter-spacing')).toBe('normal');
    }
  });
});

describe('fila de resultado: etiqueta de operación (S2.2, A4)', () => {
  it('es una etiqueta discreta: borde --rule, peso normal, sin color ni fondo', () => {
    const operation = rule('.result-row__operation');
    expect(operation.get('display')).toBe('inline-block');
    expect(operation.get('border')).toBe('1px solid var(--rule)');
    expect(operation.get('font-weight')).toBe('400');
    expect(operation.has('color')).toBe(false);
    expect(operation.has('background-color')).toBe(false);
    expect(operation.has('background')).toBe(false);
  });

  it('no cambia el alto de la línea: tamaño y interlineado de --text-small', () => {
    const operation = rule('.result-row__operation');
    expect(operation.get('font-size')).toBe('var(--text-small)');
    expect(operation.get('line-height')).toBe('var(--text-small--line-height)');
  });
});

describe('superficies neutras (S5.1-S5.3, decisión 237)', () => {
  const NOTICES = ['.nl-review__alert', '.nl-issues', '.source-list__warning', '.coverage-notice', '.empty-results'];

  it('los avisos comparten una superficie elevada y conservan borde, relleno y radio', () => {
    for (const selector of NOTICES) {
      const notice = rule(selector);
      expect(notice.get('border'), selector).toBe('1px solid var(--rule)');
      expect(notice.get('border-radius'), selector).toBe('var(--radius-panel)');
    }
    for (const selector of ['.source-list__warning', '.coverage-notice']) {
      expect(rule(selector).get('background-color'), selector).toBe('var(--surface-raised)');
    }
  });

  it('el panel de cobertura es una superficie elevada', () => {
    expect(rule('.coverage-panel').get('background-color')).toBe('var(--surface-raised)');
  });

  it('el estado vacío y las incidencias de la revisión se rebajan; las alertas siguen en danger-wash', () => {
    expect(rule('.empty-results').get('background-color')).toBe('var(--surface-sunken)');
    expect(rule('.nl-issues').get('background-color')).toBe('var(--surface-sunken)');
    expect(rule('.nl-review__alert').get('background-color')).toBe('var(--danger-wash)');
    expect(rule(".coverage-notice[role='alert']").get('background-color')).toBe('var(--danger-wash)');
  });

  it('el número de paso es una superficie elevada y el paso actual sigue invertido', () => {
    expect(rule('.steps__number').get('background-color')).toBe('var(--surface-raised)');
    expect(rule(".steps > [aria-current='step'] .steps__number").get('background-color')).toBe('var(--ink)');
  });

  it('el resumen de precio de la ficha estrecha es un panel elevado con borde y radio de panel', () => {
    const lead = rule('.property-summary--lead');
    expect(lead.get('display')).toBe('flex');
    expect(lead.get('padding')).toBe('0.75rem 1rem');
    expect(lead.get('background-color')).toBe('var(--surface-raised)');
    expect(lead.get('border')).toBe('1px solid var(--rule)');
    expect(lead.get('border-radius')).toBe('var(--radius-panel)');
  });

  it('las superficies usan solo tokens existentes', () => {
    const tokens = declaredTokens();
    for (const token of ['--color-surface-raised', '--color-surface-sunken', '--color-rule']) {
      expect(tokens, token).toContain(token);
    }
  });
});

describe('fila de resultado: insignias y «Sin foto» (S2.3, A5, A6)', () => {
  it('«1 fuente» se enmarca con outline --rule hacia dentro, sin borde ni sombra (alto cero)', () => {
    const badge = rule('.result-row__badge');
    expect(badge.get('outline')).toBe('1px solid var(--rule)');
    expect(badge.get('outline-offset')).toBe('-1px');
    for (const property of ['border', 'box-shadow', 'background-color']) {
      expect(badge.has(property), property).toBe(false);
    }
    expect(JSON.stringify([...badge])).not.toContain('--vegetation');
  });

  it('«N fuentes» conserva el verde y anula el outline', () => {
    const multi = rule('.result-row__badge--multi');
    expect(multi.get('outline')).toBe('0');
    expect(multi.get('border')).toBe('1px solid var(--vegetation)');
    expect(multi.get('background-color')).toBe('var(--vegetation-wash)');
  });

  it('«Sin foto» es una pauta cuadrada interior que no altera la caja 4:3', () => {
    const label = rule('.result-row__media > span');
    expect(label.get('position')).toBe('absolute');
    expect(label.get('inset')).toBe('0.375rem');
    expect(label.get('border')).toBe('1px solid var(--rule)');
    expect(label.get('font-weight')).toBe('600');
    expect(label.has('background-color')).toBe(false);
  });

  it('la caja de la miniatura conserva el fondo de tinta de D.17 (desviación declarada de R2.3)', () => {
    const media = rule('.result-row__media');
    expect(media.get('background-color')).toBe('color-mix(in oklab, var(--surface), var(--ink) 5%)');
    expect(media.get('aspect-ratio')).toBe('4 / 3');
  });
});

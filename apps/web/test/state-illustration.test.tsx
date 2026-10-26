// D.22 (decisión 269, IS-2 e IS-4) — ilustraciones de los estados: los datos viven en un módulo puro
// (`lib/state-illustrations.ts`) y los pintan el componente y las páginas autónomas. Decorativas:
// el estado lo dice el texto, nunca el dibujo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StateIllustration } from '../src/components/state-illustration.js';
import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';
import { STATE_ILLUSTRATION_KINDS, stateIllustrationSvg } from '../src/lib/state-illustrations.js';
import { declarations, findBlock, parseCss } from './helpers/css-tokens';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|oklch\(|rgba?\(|hsla?\(/i;

describe('state-illustrations — datos y cadena (IS-2)', () => {
  it('define exactamente los tipos empty, not-found y unavailable', () => {
    expect([...STATE_ILLUSTRATION_KINDS]).toEqual(['empty', 'not-found', 'unavailable']);
  });

  it.each(STATE_ILLUSTRATION_KINDS)('%s: un único <svg> de 96 x 64, decorativo y sin colores literales', (kind) => {
    const svg = stateIllustrationSvg(kind);

    expect(svg.startsWith('<svg class="state-illustration" viewBox="0 0 96 64" fill="none"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg.match(/<svg /g)).toHaveLength(1);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).not.toMatch(/\brole=|aria-label|<title|<desc|<text|href=|url\(|<style|<script/);
    expect(svg).not.toMatch(COLOR_LITERAL);
  });

  it('los contornos llevan su clase; la figura, currentColor; la casa solo en «unavailable»', () => {
    for (const kind of STATE_ILLUSTRATION_KINDS) {
      expect(stateIllustrationSvg(kind), kind).toContain('class="state-illustration__ring"');
    }
    for (const kind of ['empty', 'not-found'] as const) {
      expect(stateIllustrationSvg(kind), kind).toContain('stroke="currentColor"');
    }
    expect(stateIllustrationSvg('unavailable')).toContain('class="state-illustration__house"');
    expect(stateIllustrationSvg('empty')).not.toContain('state-illustration__house');
    expect(stateIllustrationSvg('not-found')).not.toContain('state-illustration__house');
  });

  it('«unavailable» reutiliza la casa de la marca (misma geometría que BRAND_MARK)', () => {
    expect(stateIllustrationSvg('unavailable')).toContain('d="M13.5 7.5 18.5 12v6.5h-10V12Zm-1 6.5h2v4.5h-2Z"');
  });

  it('los tres dibujos son distintos entre sí', () => {
    const all = STATE_ILLUSTRATION_KINDS.map((kind) => stateIllustrationSvg(kind));
    expect(new Set(all).size).toBe(3);
  });

  it('el módulo es puro: solo importa por ruta relativa (lo alcanza el proxy fuera del grafo de servidor)', () => {
    const source = read('../src/lib/state-illustrations.ts');
    const imports = [...source.matchAll(/^\s*import\s[^;]*from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);

    expect(imports.every((specifier) => specifier?.startsWith('./'))).toBe(true);
    expect(source).not.toMatch(/^\s*import\s+['"]server-only['"]/m);
  });
});

describe('<StateIllustration /> — paridad con la cadena (IS-4)', () => {
  it.each(STATE_ILLUSTRATION_KINDS)('%s: renderToStaticMarkup === stateIllustrationSvg', (kind) => {
    const html = renderToStaticMarkup(<StateIllustration kind={kind} />);

    expect(html.length).toBeGreaterThan(100);
    expect(html).toBe(stateIllustrationSvg(kind));
  });

  it('es un componente de servidor (sin "use client")', () => {
    expect(read('../src/components/state-illustration.tsx')).not.toMatch(/^\s*['"]use client['"]/m);
  });
});

// Dos juegos de reglas con los mismos valores: `globals.css` (capa de componentes) y el CSS autónomo.
describe('estilos de la ilustración y de la acción principal (IS-2, IS-4)', () => {
  const globals = findBlock(
    parseCss(read('../src/app/globals.css')),
    '@layer components'
  );
  const standalone = parseCss(STANDALONE_PAGE_CSS);

  const sets: readonly (readonly [string, (selector: string) => Map<string, string>])[] = [
    ['globals.css', (selector): Map<string, string> => declarations(findBlock(globals, selector))],
    ['standalone', (selector): Map<string, string> => declarations(findBlock(standalone, selector))],
  ];

  it.each(sets)('%s: caja de 6rem x 4rem, contornos con --rule-control y casa con --accent', (_name, rule) => {
    const box = rule('.state-illustration');
    expect(box.get('inline-size')).toBe('6rem');
    expect(box.get('block-size')).toBe('4rem');
    expect(box.get('color')).toBe('var(--ink-muted)');
    expect(rule('.state-illustration__ring').get('stroke')).toBe('var(--rule-control)');
    expect(rule('.state-illustration__ring').get('vector-effect')).toBe('non-scaling-stroke');
    expect(rule('.state-illustration__ring').get('stroke-width')).toBe('1.5');
    expect(rule('.state-illustration__figure').get('vector-effect')).toBe('non-scaling-stroke');
    expect(rule('.state-illustration__figure').get('stroke-width')).toBe('1.5');
    expect(rule('.state-illustration__house').get('fill')).toBe('var(--accent)');
  });

  it.each(sets)('%s: .state-action es la receta primaria (relleno acento, texto --ink-on-accent)', (_name, rule) => {
    const action = rule(_name === 'standalone' ? '.standalone .state-action' : '.state-action');

    expect(action.get('background-color')).toBe('var(--accent)');
    expect(action.get('color')).toBe('var(--ink-on-accent)');
    expect(action.get('border')).toBe('1px solid var(--accent)');
    expect(action.get('min-block-size') ?? action.get('min-height')).toBe('2.5rem');
    expect(action.get('text-decoration-line')).toBe('none');
  });

  it('en globals.css el enlace primario conserva el texto sobre acento al pasar el puntero', () => {
    const css = read('../src/app/globals.css');
    expect(css).toMatch(/\.state-action:hover\s*\{[^}]*color:\s*var\(--ink-on-accent\)/);
  });
});

// IS-3 (tarea 3.6): las pantallas con precios mantienen la voz neutra. Ni la lista de resultados ni la
// ficha ni el histórico de precios usan la ilustración, la acción principal ni el tono cálido del estado.
describe('voz neutra en las pantallas de precio (IS-3)', () => {
  const PRICE_SCREENS = [
    '../src/components/result-card.tsx',
    '../src/components/price-history.tsx',
    '../src/components/property-header.tsx',
    '../src/components/source-list.tsx',
  ];

  it.each(PRICE_SCREENS)('%s no usa la ilustración ni la acción principal de los estados', (file) => {
    const source = read(file);

    expect(source.length).toBeGreaterThan(100);
    expect(source).not.toMatch(/state-illustration|StateIllustration|state-action/);
    expect(source).not.toMatch(/no has hecho nada mal|que enseñarte|seguir mirando viviendas/);
  });
});

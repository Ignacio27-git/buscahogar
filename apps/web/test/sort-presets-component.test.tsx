// D.18 (decisión 227) — enlaces de ordenación junto al recuento. Server Component puro: cada
// ordenación es un `<a href>` real, así que funciona sin JavaScript.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SortPresets } from '../src/components/sort-presets.js';

function render(params: Record<string, string>, sort: string, dir: string): string {
  return renderToStaticMarkup(<SortPresets params={params} sort={sort} dir={dir} />);
}

function links(html: string): { href: string; text: string; current: boolean }[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((match) => ({
    href: /href="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? '',
    text: (match[2] ?? '').replace(/<[^>]+>/g, ''),
    current: (match[1] ?? '').includes('aria-current="true"'),
  }));
}

describe('SortPresets', () => {
  const html = render({ operation: 'sale', page: '3' }, 'updated', 'desc');

  it('una lista con nombre «Ordenar por» y cinco enlaces en el orden C-9', () => {
    expect(html).toContain('<p id="sort-presets-label">Ordenar por</p>');
    expect(html).toMatch(/<ul[^>]*aria-labelledby="sort-presets-label"/);
    expect(links(html).map((l) => l.text)).toEqual([
      'Más recientes',
      'Precio: de menor a mayor',
      'Precio: de mayor a menor',
      'Superficie: de mayor a menor',
      'Superficie: de menor a mayor',
    ]);
  });

  it('cada enlace conserva los filtros, quita page y lleva su sort/dir (el predefinido, ninguno)', () => {
    expect(links(html).map((l) => l.href)).toEqual([
      '/?operation=sale',
      '/?operation=sale&amp;sort=price&amp;dir=asc',
      '/?operation=sale&amp;sort=price&amp;dir=desc',
      '/?operation=sale&amp;sort=surface&amp;dir=desc',
      '/?operation=sale&amp;sort=surface&amp;dir=asc',
    ]);
  });

  it('solo el preset vigente lleva aria-current="true"', () => {
    expect(links(html).map((l) => l.current)).toEqual([true, false, false, false, false]);
    expect(links(render({}, 'price', 'asc')).map((l) => l.current)).toEqual([false, true, false, false, false]);
    expect(links(render({}, 'surface', 'asc')).map((l) => l.current)).toEqual([false, false, false, false, true]);
  });

  it('una combinación sin preset (updated/asc) no marca ningún enlace', () => {
    const none = links(render({ sort: 'updated', dir: 'asc' }, 'updated', 'asc'));
    expect(none).toHaveLength(5);
    expect(none.some((l) => l.current)).toBe(false);
  });

  it('ya no hay selects ni «Cualquiera» ni «Sentido»', () => {
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Cualquiera');
    expect(html).not.toContain('Sentido');
  });

  it('los enlaces miden 40px (decisión 200) y no hay estilo en línea', () => {
    expect(html).toContain('sort-presets__link');
    expect(html).not.toContain('style=');
    const css = readFileSync(
      join(fileURLToPath(new URL('../src', import.meta.url)), 'app', 'globals.css'),
      'utf8'
    );
    const rule = /\.sort-presets__link\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('min-block-size: 2.5rem');
  });

  it('es un componente de servidor', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/components/sort-presets.tsx', import.meta.url)),
      'utf8'
    );
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
  });
});

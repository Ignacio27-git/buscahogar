// Paso D.5 (spec app-shell R7, S7.1) — los iconos de la aplicación son ficheros
// estáticos de la convención `app/`: `icon.svg` sin recursos externos y `apple-icon.png` de 180x180 opaco.
// D.22 (decisión 267, BM-1, BM-5; enmienda la 149) — `icon.svg` es la marca «casa encontrada» sobre fondo
// transparente: la misma geometría que `lib/brand-mark.ts`, con los colores del tema claro y un bloque
// `prefers-color-scheme: dark` con los del oscuro (un favicon es un documento aislado: aquí los literales de
// color son inevitables, y este test los ata a `--ink` y `--accent` de `globals.css`).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BRAND_MARK } from '../src/lib/brand-mark.js';

const APP_DIR = fileURLToPath(new URL('../src/app', import.meta.url));
const SVG = readFileSync(join(APP_DIR, 'icon.svg'), 'utf8');
const CSS = readFileSync(join(APP_DIR, 'globals.css'), 'utf8');
const PNG = readFileSync(join(APP_DIR, 'apple-icon.png'));

/** Valor de un token en el bloque de selector dado (`:root` = tema claro, `.dark` = oscuro). */
function token(selector: string, name: string): string {
  const block = new RegExp(String.raw`(?:^|\n)${selector.replace('.', String.raw`\.`)}\s*\{([^}]*)\}`).exec(CSS);
  const match = new RegExp(String.raw`--${name}:\s*([^;]+);`).exec(block?.[1] ?? '');
  return (match?.[1] ?? '').trim().toLowerCase();
}

/** Declaración `propiedad:valor` de una regla de la hoja del icono (`.i`/`.h`), dentro o fuera de `@media`. */
function iconRule(source: string, selector: string, property: string): string {
  const match = new RegExp(String.raw`${selector.replace('.', String.raw`\.`)}\s*\{\s*${property}\s*:\s*([^;}]+?)\s*;?\s*\}`).exec(source);
  return (match?.[1] ?? '').trim().toLowerCase();
}

const STYLE = /<style>([\s\S]*?)<\/style>/.exec(SVG)?.[1] ?? '';
const DARK_QUERY = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*)\}\s*$/.exec(STYLE);
const LIGHT_STYLE = STYLE.slice(0, DARK_QUERY?.index ?? STYLE.length);

describe('icon.svg', () => {
  it('declara viewBox y no contiene scripts, texto ni referencias externas', () => {
    expect(SVG).toContain('viewBox="0 0 32 32"');
    for (const forbidden of ['<script', '<text', 'href', 'url(']) {
      expect(SVG).not.toContain(forbidden);
    }
  });

  it('copia exactamente la geometría de BRAND_MARK (BM-1)', () => {
    const { lens, handle, house } = BRAND_MARK;
    expect(SVG).toContain(BRAND_MARK.viewBox);
    expect(SVG).toMatch(
      new RegExp(
        `<circle[^>]*cx="${String(lens.cx)}"[^>]*cy="${String(lens.cy)}"[^>]*r="${String(lens.r)}"[^>]*stroke-width="${String(lens.strokeWidth)}"`,
      ),
    );
    expect(SVG).toMatch(
      new RegExp(`<path[^>]*d="${handle.d}"[^>]*stroke-width="${String(handle.strokeWidth)}"[^>]*stroke-linecap="round"`),
    );
    expect(SVG).toMatch(new RegExp(`<path[^>]*fill-rule="evenodd"[^>]*d="${house.d}"`));
  });

  it('no lleva fondo: es transparente y la marca es lo único dibujado', () => {
    expect(SVG).not.toMatch(/<rect/);
  });

  it('el estilo claro usa los literales de --ink y --accent de :root', () => {
    expect(token(':root', 'ink')).toMatch(/^#[0-9a-f]{6}$/);
    expect(iconRule(LIGHT_STYLE, '.i', 'stroke')).toBe(token(':root', 'ink'));
    expect(iconRule(LIGHT_STYLE, '.h', 'fill')).toBe(token(':root', 'accent'));
  });

  it('declara @media (prefers-color-scheme: dark) con los literales de --ink y --accent de .dark', () => {
    expect(DARK_QUERY).not.toBeNull();
    const dark = DARK_QUERY?.[1] ?? '';
    expect(token('.dark', 'ink')).toMatch(/^oklch\(/);
    expect(iconRule(dark, '.i', 'stroke')).toBe(token('.dark', 'ink'));
    expect(iconRule(dark, '.h', 'fill')).toBe(token('.dark', 'accent'));
  });

  it('no usa ningún otro color que los literales de esas reglas', () => {
    const outsideStyle = SVG.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(outsideStyle).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i);
  });
});

describe('apple-icon.png', () => {
  it('tiene firma PNG', () => {
    expect([...PNG.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('IHDR: 180x180, 8 bits, color RGB o RGBA', () => {
    expect(PNG.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(PNG.readUInt32BE(16)).toBe(180);
    expect(PNG.readUInt32BE(20)).toBe(180);
    expect(PNG[24]).toBe(8);
    expect([2, 6]).toContain(PNG[25]);
  });
});

describe('sin manifiesto ni imagen social (BM-5)', () => {
  it('app/ no contiene manifest ni opengraph-image', () => {
    expect(readdirSync(APP_DIR).filter((name) => /^(manifest|opengraph-image|twitter-image)/.test(name))).toEqual([]);
  });
});

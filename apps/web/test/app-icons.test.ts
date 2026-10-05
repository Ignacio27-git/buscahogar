// Paso D.5 (spec app-shell R7, S7.1) — los iconos de la aplicación son ficheros
// estáticos de la convención `app/`: `icon.svg` sin recursos externos y con los
// colores del tema claro, y `apple-icon.png` de 180x180 opaco.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP_DIR = fileURLToPath(new URL('../src/app', import.meta.url));
const SVG = readFileSync(join(APP_DIR, 'icon.svg'), 'utf8');
const CSS = readFileSync(join(APP_DIR, 'globals.css'), 'utf8');
const PNG = readFileSync(join(APP_DIR, 'apple-icon.png'));

/** Valor de un token en el primer bloque `:root` (tema claro). */
function lightToken(name: string): string {
  const root = /:root\s*\{([^}]*)\}/.exec(CSS);
  const match = new RegExp(`--${name}:\s*([^;]+);`).exec(root?.[1] ?? '');
  return (match?.[1] ?? '').trim().toLowerCase();
}

describe('icon.svg', () => {
  it('declara viewBox y no contiene scripts, texto ni referencias externas', () => {
    expect(SVG).toContain('viewBox="0 0 32 32"');
    for (const forbidden of ['<script', '<text', 'href', 'url(']) {
      expect(SVG).not.toContain(forbidden);
    }
  });

  it('usa exactamente los colores claros de --surface, --ink y --accent', () => {
    const colours = [...SVG.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) =>
      (m[1] ?? '').toLowerCase(),
    );
    expect(new Set(colours)).toEqual(
      new Set([lightToken('surface'), lightToken('ink'), lightToken('accent')]),
    );
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

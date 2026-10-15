// D.19 (decisión 231, spec «favorable-status-color») — el verde significa estado favorable y nunca
// algo accionable. Este guarda lee `globals.css` y comprueba que `--vegetation`, `--vegetation-wash` y
// `--danger-wash` solo aparecen en los selectores de las claves previstas, y que ninguno es un enlace,
// un botón ni un control de formulario. El azul sigue siendo el único color interactivo.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findBlocks, parseCss, type CssNode } from './helpers/css-tokens';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const GLOBALS = parseCss(readFileSync(join(SRC_DIR, 'app', 'globals.css'), 'utf8'));

/** Selectores de un preludio separados por comas de primer nivel, sin espacios ni comillas. */
function selectorList(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of prelude.replace(/\s+/g, ' ').replace(/['"]/g, '').trim()) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Selectores de las reglas (a cualquier profundidad) que usan `var(--token)` en alguna declaración. Los
 * bloques `@theme` quedan fuera: ahí el token solo se mapea a una utilidad, no se consume.
 */
function consumers(token: string): string[] {
  const pattern = new RegExp(`var\\(--${token}\\)`);
  const nodes: CssNode[] = findBlocks(GLOBALS).filter(
    (node) =>
      !node.prelude.startsWith('@theme') &&
      node.declarations.some(([, value]) => pattern.test(value))
  );
  return nodes.flatMap((node) => selectorList(node.prelude)).sort();
}

const VEGETATION_CUES = [
  '.source-row__highlight--active',
  '.result-row__badge--multi',
  '.source-row__status--available',
];

const INTERACTIVE = /^(a|button|input|select|textarea|summary|label)\b|\[role=button\]|:hover|:focus|:active/;

describe('guarda del verde de estado (spec «Green means favorable status, never interactive»)', () => {
  it('--vegetation solo se usa en las tres claves de estado favorable', () => {
    expect(consumers('vegetation')).toEqual([...VEGETATION_CUES].sort());
  });

  it('--vegetation-wash solo se usa en «Más económico» y «Disponible en N fuentes»', () => {
    expect(consumers('vegetation-wash')).toEqual(
      ['.source-row__highlight--active', '.result-row__badge--multi'].sort()
    );
  });

  it('ni el verde ni sus lavados llegan a un enlace, botón o control, ni a hover, foco o pulsado', () => {
    const all = [...consumers('vegetation'), ...consumers('vegetation-wash')];
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((selector) => INTERACTIVE.test(selector))).toEqual([]);
  });

  it('--danger-wash solo tiñe las alertas (role=alert) que ya llevan borde de peligro', () => {
    expect(consumers('danger-wash')).toEqual(
      [
        ".coverage-notice[role=alert]",
        '.coverage-panel:has(> .coverage-notice[role=alert])',
        '.nl-review__alert',
      ].sort()
    );
  });

  it('--accent-wash no tiñe ningún estado: solo se consume como utilidad bg-accent-wash', () => {
    expect(consumers('accent-wash')).toEqual([]);
  });

  it('el verde no aparece fuera de globals.css (ni como utilidad ni en estilos en línea)', () => {
    const files = ['components', 'lib', 'app'].flatMap((dir) => listFiles(join(SRC_DIR, dir)));
    const offenders = files.filter((file) => {
      if (file.endsWith('globals.css')) return false;
      return /vegetation|--danger-wash/.test(readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });
});

function listFiles(dir: string): string[] {
  return readdirSyncRecursive(dir).filter((file) => /\.(ts|tsx|css)$/.test(file));
}

function readdirSyncRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? readdirSyncRecursive(full) : [full];
  });
}

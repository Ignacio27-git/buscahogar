// D.19 (decisión 230, spec «Glyph coverage») — Figtree se sirve solo con el subconjunto latin. Cualquier
// carácter que `apps/web/src` PINTE y que quede fuera de ese subconjunto caería a la pila del sistema y
// se vería con otra tipografía. Los comentarios no se pintan, así que ↗ (U+2197) y ∈ (U+2208) pueden
// aparecer solo en ellos.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

// Rango `unicode-range` del subconjunto latin de @fontsource-variable/figtree@5.3.0 (`unicode.json`,
// clave `latin`): el mismo que sirve el woff2 de `src/fonts`. Se copia aquí porque el paquete no es una
// dependencia del proyecto.
const FIGTREE_LATIN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

function covered(codePoint: number): boolean {
  return FIGTREE_LATIN_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/** Caracteres de `text` fuera del subconjunto latin de Figtree, sin repetir. */
function uncovered(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (!covered(codePoint)) found.add(char);
  }
  return [...found];
}

/** Quita comentarios de bloque y de línea (`//` solo al inicio o tras un espacio, para respetar `https://`). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('cobertura de glifos de Figtree latin (D.19)', () => {
  it('el detector marca ↗ y ∈ y deja pasar acentos, ñ, ¿, ¡, «, », €, ·, ª, º, ², guion largo y puntos suspensivos', () => {
    expect(uncovered('↗ ∈')).toEqual(['↗', '∈']);
    expect(uncovered('áéíóúüñÑ ¿¡ «» € · ª º ² — … −')).toEqual([]);
  });

  it('el detector ignora los comentarios, así que un ↗ comentado no cuenta', () => {
    expect(uncovered(stripComments('const a = 1; // ↗ flecha\n/* ∈ */ const b = "ñ";'))).toEqual([]);
    expect(uncovered(stripComments('const a = "↗";'))).toEqual(['↗']);
    expect(stripComments('const u = "https://x.es"; // nota')).toContain('https://x.es');
  });

  it('ningún texto pintado de apps/web/src queda fuera del subconjunto latin', () => {
    const files = listSources(SRC_DIR);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      uncovered(stripComments(readFileSync(file, 'utf8'))).map((char) => `${file}: ${char}`)
    );
    expect(offenders).toEqual([]);
  });
});

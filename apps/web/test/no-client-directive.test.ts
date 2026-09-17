// ROADMAP 1.11 — prueba estática (diseño D10; spec, escenario "Works
// without client-side JavaScript"): ningún fichero de `apps/web/src`
// tocado por este cambio declara `'use client'`. Server Components puros,
// server-rendered, sin ningún fetching en cliente.
//
// Recorrido manual con `readdirSync` en vez de `fs.globSync` (solo estable
// desde Node 22): el `engines` declarado del monorepo es `>=20.11.0`.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(`${fullPath}/`));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('apps/web/src — ningún fichero declara "use client" (D10)', () => {
  it('ninguno de los .ts/.tsx tocados en este cambio abre con la directiva "use client"', () => {
    const files = collectSourceFiles(SRC_DIR);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });
});

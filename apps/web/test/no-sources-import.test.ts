// ROADMAP 1.11 — prueba estática de cuota cero (diseño, spec «Zero
// External Calls At Search Time», verification anchor): el camino de
// búsqueda web (page.tsx, db.ts, componentes importados) no importa nada
// de ningún módulo adaptador de fuente. Mismo patrón que
// apps/ingestion/test/backfill-thumbnails-no-sources-import.test.ts (D6).
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

describe('apps/web/src — ningún import apunta a un módulo adaptador de fuente', () => {
  it('ningún especificador de import contiene "sources/"', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of importSpecifiers) {
        expect(specifier).not.toMatch(/sources\//);
      }
    }
  });
});

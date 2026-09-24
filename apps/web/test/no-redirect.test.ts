// ROADMAP 1.12 (spec, requisito "No Redirect In Any Of The Four Cases";
// threat-matrix obs #191, fila "Routing — outbound redirect to a source
// URL") — prueba estática: ningún fichero de `apps/web/src` importa ni
// invoca `redirect()` de `next/navigation`. `listings.url` se renderiza
// siempre como `<a href>` (dato de origen no confiable, nunca destino de un
// `redirect()` del lado del servidor) — ver `source-list.tsx`. Mismo patrón
// de recorrido que `no-client-directive.test.ts` y `no-sources-import.test.ts`.
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

describe('apps/web/src — ningún fichero importa o invoca redirect()', () => {
  it('ningún .ts/.tsx importa `redirect` de next/navigation ni llama a redirect(', () => {
    const files = collectSourceFiles(SRC_DIR);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\bredirect\s*\(/);
      expect(source).not.toMatch(/import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*['"]next\/navigation['"]/);
    }
  });
});

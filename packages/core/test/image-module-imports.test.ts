// ROADMAP 2.3 — spec "No Native or I-O Dependencies in packages/core": el
// módulo de imagen de `packages/core` no puede importar ningún binding
// nativo ni de I/O — los hashes llegan siempre como datos ya calculados
// desde `apps/ingestion` (decisión 093). Análisis ESTÁTICO del texto fuente,
// mismo patrón que `apps/web/test/no-client-directive.test.ts`: falla en voz
// alta ante un import prohibido, sin ejecutar el módulo.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const IMAGE_STRATEGY_DIR = fileURLToPath(new URL('../src/strategies/image/', import.meta.url));

// sharp/@img/*: decodificación nativa de imagen (apps/ingestion, ROADMAP
// 2.3). fs/node:fs: lectura de fichero. http/node:http: red. Ninguno tiene
// sitio en un comparador puro de hashes ya calculados.
const FORBIDDEN_IMPORT_PATTERN = /from\s+['"](sharp|@img\/[^'"]*|fs|node:fs|http|node:http)['"]/;

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => `${dir}${entry.name}`);
}

describe('packages/core/src/strategies/image — cero imports nativos/I-O (spec "No Native or I-O Dependencies")', () => {
  it('ningún fichero del módulo de imagen importa sharp, @img/*, fs, node:fs, http ni node:http', () => {
    const files = collectTsFiles(IMAGE_STRATEGY_DIR);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(FORBIDDEN_IMPORT_PATTERN.test(source)).toBe(false);
    }
  });
});

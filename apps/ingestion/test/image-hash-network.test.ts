// ROADMAP 2.3 — spec "No Native or I-O Dependencies..." aplicado a
// apps/ingestion: el módulo `image-hash/` calcula hashes a partir de
// buffers YA EN MEMORIA (fotos base committeadas, Phase 3) — nunca abre una
// conexión de red ni de base de datos por sí mismo, mismo criterio REQ-NONET
// que `test/setup-no-network.ts`. Análisis ESTÁTICO del texto fuente, mismo
// patrón que `image-module-imports.test.ts` (packages/core).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const IMAGE_HASH_DIR = fileURLToPath(new URL('../src/image-hash/', import.meta.url));

// http/https/node:http/node:https/undici: red directa. pg/drizzle-orm/
// @buscahogar/db: base de datos — el hashing de imágenes no persiste nada
// por sí mismo (Phase 3/4 escriben a JSON, nunca a BD, D7).
const FORBIDDEN_IMPORT_PATTERN =
  /from\s+['"](http|https|node:http|node:https|undici|pg|drizzle-orm|@buscahogar\/db)['"]/;

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => `${dir}${entry.name}`);
}

describe('apps/ingestion/src/image-hash — cero imports de red/BD (REQ-NONET)', () => {
  it('ningún fichero del módulo de hashing importa un cliente de red o de base de datos', () => {
    const files = collectTsFiles(IMAGE_HASH_DIR);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(FORBIDDEN_IMPORT_PATTERN.test(source)).toBe(false);
    }
  });

  it('ningún fichero del módulo de hashing llama a fetch() directamente', () => {
    const files = collectTsFiles(IMAGE_HASH_DIR);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(/\bfetch\s*\(/.test(source)).toBe(false);
    }
  });
});

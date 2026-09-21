// ROADMAP 1.12 (spec, requisito "Single-Source Is A First-Class Render", PD-A;
// arbitraje obs #194, assumption 7) — confirmación ESTÁTICA de que N=1 no es
// un caso degradado: ningún fichero de la página de detalle ramifica el JSX
// según `sources.length === 1` (o `=== 1`/`> 1` sobre el mismo array). La
// mitad de tono/maquetación queda como MANUAL ACCEPTANCE (misma clase que
// 1.11) — esta prueba cubre mecánicamente la mitad estructural.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FILES = [
  '../src/app/properties/[listingId]/page.tsx',
  '../src/components/property-header.tsx',
  '../src/components/source-gallery.tsx',
  '../src/components/source-list.tsx',
];

describe('página de detalle — sin rama condicional por sources.length === 1 (PD-A)', () => {
  it('ningún fichero de la página de detalle contiene una comparación de longitud sobre `sources`', () => {
    for (const relativePath of FILES) {
      const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toMatch(/sources\.length\s*(===|==|>|<)\s*1\b/);
      expect(source).not.toMatch(/\bslides\.length\s*===\s*1\b/);
    }
  });
});

// ROADMAP 1.12 (spec, escenario "Malformed uuid is a 404"; arbitraje obs
// #193, spec assumption 4) — la spec exige DOS piezas de evidencia
// independientes para la rama `notFound()` del parseo Zod, ninguna
// opcional: (1) el test de esquema (`property-detail-params.schema.test.ts`,
// WU2) confirma que `safeParse` rechaza un valor malformado; (2) esta
// prueba confirma ESTÁTICAMENTE que la rama de fallo del `safeParse`
// LLEGA a una llamada a `notFound()`, no a un rechazo silencioso. La
// invocación directa en `property-detail-page.test.tsx` es evidencia
// ADICIONAL (la propia spec assumption 4 la marca como intentada, no como
// la única ni la bloqueante), no un sustituto de esta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PAGE_PATH = fileURLToPath(new URL('../src/app/properties/[listingId]/page.tsx', import.meta.url));

describe('página de detalle — notFound() alcanzable desde la rama de fallo del parseo (D2)', () => {
  it('importa notFound desde next/navigation', () => {
    const source = readFileSync(PAGE_PATH, 'utf8');
    expect(source).toMatch(/import\s*\{\s*notFound\s*\}\s*from\s*['"]next\/navigation['"]/);
  });

  it('el bloque `if (!parsed.success)` contiene una llamada a notFound(), nunca un `try/catch` que la trague', () => {
    const source = readFileSync(PAGE_PATH, 'utf8');
    const match = /if\s*\(!parsed\.success\)\s*\{([^}]*)\}/.exec(source);

    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/\bnotFound\(\);/);
    expect(source).not.toMatch(/try\s*\{[^]*notFound\(\)[^]*\}\s*catch/);
  });

  it('el header ausente (undefined) también llega a notFound(), no solo el uuid malformado', () => {
    const source = readFileSync(PAGE_PATH, 'utf8');
    const match = /if\s*\(header === undefined\)\s*\{([^}]*)\}/.exec(source);

    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/\bnotFound\(\);/);
  });
});

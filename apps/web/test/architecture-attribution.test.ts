// ROADMAP 1.13 (diseño A-3) — la atribución CC-BY/IGN también debe quedar
// registrada en la documentación del repositorio, no solo visible al
// usuario (A-3, escenario "Repo documentation records the attribution").
// Comprobado por un test EJECUTABLE que lee el fichero real, nunca por
// inspección manual (spec obs #214).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ARCHITECTURE_PATH = fileURLToPath(new URL('../../../docs/ARCHITECTURE.md', import.meta.url));

describe('docs/ARCHITECTURE.md — sección de atribución CC-BY/IGN (A-3)', () => {
  it('contiene una sección de atribución que nombra IGN/CNIG y la licencia CC-BY', () => {
    const content = readFileSync(ARCHITECTURE_PATH, 'utf8');
    expect(content).toMatch(/IGN|CNIG/);
    expect(content).toContain('CC-BY');
  });
});

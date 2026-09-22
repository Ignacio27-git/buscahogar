// ROADMAP 1.13 Unit D (tarea 13.4/13.5; spec «The status component never
// imports the write module») — `coverage-status.tsx` nunca importa el
// módulo INSERT-only (`@/server/coverage-db` / `server/coverage-db.js`).
// En la práctica no importa NINGÚN módulo de servidor (recibe el job ya
// resuelto como prop, D8), lo que satisface la propiedad trivialmente —
// esta prueba lo hace EXPLÍCITO, mismo espíritu que DD-20 para el
// allowlist de 'use client'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const COVERAGE_STATUS_PATH = fileURLToPath(new URL('../src/components/coverage-status.tsx', import.meta.url));

describe('coverage-status.tsx — nunca importa el módulo de escritura (D8, DD-15)', () => {
  it('ningún especificador de import apunta a server/coverage-db ni a server/db', () => {
    const source = readFileSync(COVERAGE_STATUS_PATH, 'utf8');
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(/server\/coverage-db/);
      expect(specifier).not.toMatch(/server\/db/);
    }
  });
});

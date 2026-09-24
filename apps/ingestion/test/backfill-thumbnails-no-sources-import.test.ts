// ROADMAP 1.11 — prueba estática de cuota cero (diseño D6): lee el propio
// texto fuente de backfill-thumbnails.ts y comprueba que no importa nada de
// `src/sources/**`. Complementa (no sustituye) el test contra PostgreSQL
// real (test/db/backfill-thumbnails.db.test.ts): esta prueba cubre cualquier
// import muerto que solo la lectura del fichero alcanza, aquella cubre la
// ruta EJECUTADA — mismo razonamiento que D11/D12 para
// scripts/reprocess-dedup.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/backfill-thumbnails.ts', import.meta.url));

describe('backfill-thumbnails.ts — cero cuota: ningún import de src/sources/** (D6)', () => {
  it('el texto fuente no contiene ningún especificador que apunte a sources/', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).not.toMatch(/sources\//);
    }
  });
});

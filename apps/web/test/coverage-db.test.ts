// ROADMAP 1.13 Unit D (diseño DD-15; docs/DECISIONS.md, decisión 064) —
// singleton HERMANO de `getDb()` (apps/web/src/server/db.ts), nunca el
// mismo: variable de entorno distinta (`WEB_COVERAGE_DATABASE_URL`), clave
// de caché en `globalThis` distinta (`buscahogarCoverageDb`, nunca
// `buscahogarDb` — reutilizar esa clave devolvería en silencio el pool
// equivocado), y clase de error propia para que una credencial ausente
// nombre la variable correcta. Mismo patrón exacto que `test/db.test.ts`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCoverageDb, MissingCoverageDatabaseUrlError } from '../src/server/coverage-db.js';

describe('getCoverageDb — WEB_COVERAGE_DATABASE_URL ausente (DD-15, decisión 064)', () => {
  const originalCoverageDatabaseUrl = process.env.WEB_COVERAGE_DATABASE_URL;

  beforeEach(() => {
    delete process.env.WEB_COVERAGE_DATABASE_URL;
  });

  afterEach(() => {
    if (originalCoverageDatabaseUrl !== undefined) {
      process.env.WEB_COVERAGE_DATABASE_URL = originalCoverageDatabaseUrl;
    }
  });

  it('lanza MissingCoverageDatabaseUrlError cuando WEB_COVERAGE_DATABASE_URL no está definida', () => {
    expect(() => getCoverageDb()).toThrow(MissingCoverageDatabaseUrlError);
  });

  it('el mensaje nombra la decisión 064 y la variable correcta, nunca DATABASE_URL', () => {
    expect(() => getCoverageDb()).toThrow(/decisión 064/);
    expect(() => getCoverageDb()).toThrow(/WEB_COVERAGE_DATABASE_URL/);
  });

  it('una cadena vacía se trata igual que ausencia', () => {
    process.env.WEB_COVERAGE_DATABASE_URL = '';
    expect(() => getCoverageDb()).toThrow(MissingCoverageDatabaseUrlError);
  });
});

// Compuerta de seguridad para las suites que ESCRIBEN (TRUNCATE + INSERT)
// contra PostgreSQL real (decisión 046: una ejecución previa vació la base de
// desarrollo). Difiere a propósito de `describeWithDb`:
//
// - Lee SOLO `TEST_DATABASE_URL`. Nunca `DATABASE_URL`, aunque `setup-env.ts`
//   la cargue del `.env` raíz: sin variable dedicada, la suite se OMITE.
// - Exige que el nombre de la base termine en `_test`.
// - Se niega si la URL coincide con `DATABASE_URL` (la base de desarrollo).
//
// Ejecución manual (Docker + base de prueba), p. ej.:
//   TEST_DATABASE_URL=postgres://.../buscahogar_test pnpm --filter @buscahogar/db exec vitest run test/search/search-map.db.test.ts
import { describe } from 'vitest';

export function resolveTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') {
    return undefined;
  }
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test" (recibido: "${databaseName}")`);
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL no puede ser igual a DATABASE_URL (base de desarrollo)');
  }
  return url;
}

export function describeWithTestDb(name: string, factory: (url: string) => void): void {
  const url = resolveTestDatabaseUrl();
  if (url === undefined) {
    describe.skip(`${name} [OMITIDA: falta TEST_DATABASE_URL]`, () => undefined);
    return;
  }
  describe(name, () => {
    factory(url);
  });
}

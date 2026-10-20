// Compuerta de las suites que ESCRIBEN (TRUNCATE + INSERT) contra PostgreSQL real
// (decisión 046: una ejecución previa vació la base de desarrollo). Desde la decisión
// 245 ya no existe `TEST_DATABASE_URL`: `test/setup-env.ts` reescribe `DATABASE_URL`
// hacia la base `<dev>_db_test`, así que basta con leerla, y `truncateAll` comprueba
// además la base realmente conectada antes de vaciar nada.
//
// Sin `DATABASE_URL` la suite se OMITE con un motivo visible, nunca cuenta como pasada.
import { describe } from 'vitest';

export function resolveTestDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    return undefined;
  }
  // Defensa en profundidad: aunque el setup ya la redirigió, una URL que no sea de
  // pruebas (p. ej. un worker sin `setup-env.ts`) falla aquí en vez de truncar.
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `DATABASE_URL apunta a "${databaseName}", no a una base _test: test/setup-env.ts debió redirigirla.`
    );
  }
  return url;
}

export function describeWithTestDb(name: string, factory: (url: string) => void): void {
  const url = resolveTestDatabaseUrl();
  if (url === undefined) {
    describe.skip(`${name} [OMITIDA: falta DATABASE_URL]`, () => undefined);
    return;
  }
  describe(name, () => {
    factory(url);
  });
}

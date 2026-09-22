// ROADMAP 1.13 Unit D — handle de base de datos INSERT-only para el
// registro de barridos bajo demanda (diseño DD-15; docs/DECISIONS.md,
// decisión 064, que enmienda la 056 igual que la 056 enmendó la 015).
//
// Hermano deliberado de `./db.ts`, NUNCA fusionado con él: fusionarlos
// borraría toda la propiedad de seguridad de la decisión 056 — hoy un
// `INSERT`/`UPDATE`/`DELETE` accidental en un camino de lectura lo rechaza
// PostgreSQL mismo, no la revisión de código. Un único handle compartido
// haría que ese accidente tuviera éxito en silencio.
//
// Tres diferencias deliberadas frente a `getDb()` (`./db.ts`):
//   1. Variable de entorno distinta: `WEB_COVERAGE_DATABASE_URL`, nunca
//      `DATABASE_URL` — un mensaje de error debe nombrar la variable que
//      realmente falta.
//   2. Clave de caché en `globalThis` distinta: `buscahogarCoverageDb`,
//      nunca `buscahogarDb` — reutilizar esa clave devolvería en silencio
//      el pool de lectura en vez del de escritura (o viceversa).
//   3. Clase de error propia: `MissingCoverageDatabaseUrlError`.
//
// R3 (diseño, sin resolver por ningún agente): el rol `INSERT`-only sobre
// `coverage_jobs` todavía no existe — lo provisiona el mantenedor (tarea
// 10.5). La prueba negativa de privilegios (tarea 10.6) vive en
// `test/db/coverage-role-privileges.test.ts`, omitida hasta entonces.
import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

export class MissingCoverageDatabaseUrlError extends Error {}

const globalForCoverageDb = globalThis as unknown as {
  buscahogarCoverageDb?: ReturnType<typeof createDb>;
};

export function getCoverageDb(): Database {
  if (globalForCoverageDb.buscahogarCoverageDb === undefined) {
    const connectionString = process.env.WEB_COVERAGE_DATABASE_URL;
    if (connectionString === undefined || connectionString === '') {
      throw new MissingCoverageDatabaseUrlError(
        'WEB_COVERAGE_DATABASE_URL no está definida: el registro de barridos bajo demanda ' +
          'necesita su propio rol INSERT-only sobre coverage_jobs, distinto del rol de solo ' +
          'lectura de DATABASE_URL (docs/DECISIONS.md, decisión 064).'
      );
    }
    globalForCoverageDb.buscahogarCoverageDb = createDb(connectionString);
  }
  return globalForCoverageDb.buscahogarCoverageDb.db;
}

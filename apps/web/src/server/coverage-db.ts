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
//
// ROADMAP 1.15 (security-hardening, diseño decisión 078): la validación
// Zod de `WEB_COVERAGE_DATABASE_URL` vive ahora en `./env.js` (lector
// canónico compartido); `MissingCoverageDatabaseUrlError` se RE-EXPORTA
// desde aquí para que ningún import existente (`test/coverage-db.test.ts`)
// cambie. Guardado con `import 'server-only'` (diseño decisión 081): este
// módulo posee un handle de DB de escritura.
import 'server-only';

import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

import { readCoverageDatabaseUrl } from './env';

export { MissingCoverageDatabaseUrlError } from './env';

// Decisión 256 (ROADMAP 3.4): el registro de cobertura es una escritura puntual por petición de usuario;
// 2 conexiones por instancia bastan y dejan margen al pooler.
const COVERAGE_POOL_MAX = 2;

const globalForCoverageDb = globalThis as unknown as {
  buscahogarCoverageDb?: ReturnType<typeof createDb>;
};

export function getCoverageDb(): Database {
  if (globalForCoverageDb.buscahogarCoverageDb === undefined) {
    globalForCoverageDb.buscahogarCoverageDb = createDb(readCoverageDatabaseUrl(), { max: COVERAGE_POOL_MAX });
  }
  return globalForCoverageDb.buscahogarCoverageDb.db;
}

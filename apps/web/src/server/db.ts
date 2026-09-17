// ROADMAP 1.11 — handle de base de datos para apps/web (diseño D11;
// docs/DECISIONS.md, decisión 056). `apps/web` SÍ lee `process.env` (a
// diferencia de `packages/db`, decisión 024): es la única capa con permiso
// para conocer el nombre `DATABASE_URL` de su propio rol de solo lectura.
//
// Falla alto en la PRIMERA petición cuando la credencial no está definida —
// nunca un valor por defecto, nunca una lista de resultados vacía que un
// usuario confundiría con "sin viviendas" cuando la verdad es "sin
// credencial", un falso verde en producción.
import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

export class MissingDatabaseUrlError extends Error {}

// Singleton a nivel de módulo cacheado en `globalThis`, narrowed sin `any`
// (CLAUDE.md): Next en desarrollo reevalúa módulos en cada HMR, y
// `createDb` construye un `pg.Pool` nuevo en cada llamada — sin este caché,
// cada guardado en caliente abriría un pool nuevo sin cerrar el anterior.
const globalForDb = globalThis as unknown as { buscahogarDb?: ReturnType<typeof createDb> };

export function getDb(): Database {
  if (globalForDb.buscahogarDb === undefined) {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined || connectionString === '') {
      throw new MissingDatabaseUrlError(
        'DATABASE_URL no está definida: apps/web necesita su propio rol de solo lectura ' +
          '(docs/DECISIONS.md, decisión 056).'
      );
    }
    globalForDb.buscahogarDb = createDb(connectionString);
  }
  return globalForDb.buscahogarDb.db;
}

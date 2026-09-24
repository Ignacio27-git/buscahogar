// ROADMAP 1.11 — handle de base de datos para apps/web (diseño D11;
// docs/DECISIONS.md, decisión 056). `apps/web` SÍ lee `process.env` (a
// diferencia de `packages/db`, decisión 024): es la única capa con permiso
// para conocer el nombre `DATABASE_URL` de su propio rol de solo lectura.
//
// Falla alto en la PRIMERA petición cuando la credencial no está definida —
// nunca un valor por defecto, nunca una lista de resultados vacía que un
// usuario confundiría con "sin viviendas" cuando la verdad es "sin
// credencial", un falso verde en producción.
//
// ROADMAP 1.15 (security-hardening, diseño decisión 078): la validación
// Zod de `DATABASE_URL` vive ahora en `./env.js` (lector canónico
// compartido); `MissingDatabaseUrlError` se RE-EXPORTA desde aquí para que
// ningún import existente (`test/db.test.ts`) cambie. Guardado con
// `import 'server-only'` (diseño decisión 081): este módulo posee un handle
// de DB, un import accidental desde código de cliente debe fallar en
// build, no colar en silencio.
import 'server-only';

import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

import { readDatabaseUrl } from './env';

export { MissingDatabaseUrlError } from './env';

// Singleton a nivel de módulo cacheado en `globalThis`, narrowed sin `any`
// (CLAUDE.md): Next en desarrollo reevalúa módulos en cada HMR, y
// `createDb` construye un `pg.Pool` nuevo en cada llamada — sin este caché,
// cada guardado en caliente abriría un pool nuevo sin cerrar el anterior.
const globalForDb = globalThis as unknown as { buscahogarDb?: ReturnType<typeof createDb> };

export function getDb(): Database {
  if (globalForDb.buscahogarDb === undefined) {
    globalForDb.buscahogarDb = createDb(readDatabaseUrl());
  }
  return globalForDb.buscahogarDb.db;
}

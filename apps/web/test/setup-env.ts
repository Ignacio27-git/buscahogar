// ROADMAP 1.13 Unit D — carga `DATABASE_URL`/`WEB_COVERAGE_DATABASE_URL` (y
// el resto de variables de `.env` de la raíz del monorepo) en `process.env`
// antes de que arranque cualquier test. Usa la API nativa de Node
// (`process.loadEnvFile`), que lee el fichero directamente sin que este
// código —ni quien lo ejecuta— vea ni imprima su contenido. Mismo patrón
// EXACTO que `packages/db/test/setup-env.ts`.
//
// `apps/web` normalmente nunca lee un fichero `.env` directamente en
// producción (Next.js/Compose se lo inyectan): esta suite de integración es
// la excepción explícita para las pruebas DB-backed de esta unidad
// (`test/db/*.test.ts`), que necesitan una conexión real contra Docker
// (ROADMAP 1.2) para probar comportamiento genuino, no fixtures.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { redirectToTestDatabase } from '@buscahogar/db/test-database';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// Decisión 245: ninguna suite alcanza la base de desarrollo. Tras cargar el `.env`, las
// tres URLs de conexión se reescriben en este proceso hacia `<dev>_web_test` (la que
// `global-setup.ts` ya creó, migró y a la que concedió los GRANT de los roles acotados);
// los helpers y el código de la app siguen leyendo las mismas variables.
redirectToTestDatabase(process.env, 'web', [
  'DATABASE_URL',
  'WEB_DATABASE_URL',
  'WEB_COVERAGE_DATABASE_URL',
]);

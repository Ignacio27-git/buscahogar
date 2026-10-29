// Vitest `globalSetup` de `apps/web` (decisión 245): crea `<dev>_web_test` si falta, la
// migra y, cuando las suites de roles están en uso (`WEB_DATABASE_URL` o
// `WEB_COVERAGE_DATABASE_URL`), aplica los mismos GRANT que el bootstrap de desarrollo
// (`packages/db/sql/bootstrap-roles-grants.sql`, decisión 056). Sin `DATABASE_URL` no
// hace nada; con ella y la base caída, falla alto con la salida ejecutable.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { prepareTestDatabase, testDatabaseUrl } from '@buscahogar/db/test-database';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

export default async function setup(): Promise<void> {
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
  const devUrl = process.env.DATABASE_URL;
  if (devUrl === undefined || devUrl === '') {
    return;
  }
  const rolesInUse =
    (process.env.WEB_DATABASE_URL ?? '') !== '' ||
    (process.env.WEB_COVERAGE_DATABASE_URL ?? '') !== '';
  await prepareTestDatabase(testDatabaseUrl(devUrl, 'web'), { grantWebRoles: rolesInUse });
}

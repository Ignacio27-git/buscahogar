// Vitest `globalSetup` de la suite DB de `apps/ingestion` (decisión 245): crea
// `<dev>_ingestion_test` si falta y la migra una sola vez por ejecución. Sin
// `DATABASE_URL` no hace nada (`setup-db-env.ts` lanza con su propio mensaje); con ella
// y la base caída, falla alto con la salida ejecutable.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { prepareTestDatabase, testDatabaseUrl } from '@buscahogar/db/test-database';

const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

export default async function setup(): Promise<void> {
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
  const devUrl = process.env.DATABASE_URL;
  if (devUrl === undefined || devUrl === '') {
    return;
  }
  await prepareTestDatabase(testDatabaseUrl(devUrl, 'ingestion'), { grantWebRoles: false });
}

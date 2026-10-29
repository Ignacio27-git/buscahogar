// Vitest `globalSetup` del paquete (decisión 245): una sola vez por ejecución crea la
// base `<dev>_db_test` si falta y aplica las migraciones. Sin `DATABASE_URL` no hace
// nada (las suites `describeWithDb` se omiten, y las configs fail-loud lanzan en su
// propio `setup-require-db.ts`). Con ella y la base caída, falla alto con la salida
// ejecutable. Lee el `.env` con la API nativa de Node, sin ver ni imprimir su contenido.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { prepareTestDatabase, testDatabaseUrl } from '../src/test-database.js';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

export default async function setup(): Promise<void> {
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
  const devUrl = process.env.DATABASE_URL;
  if (devUrl === undefined || devUrl === '') {
    return;
  }
  await prepareTestDatabase(testDatabaseUrl(devUrl, 'db'), { grantWebRoles: false });
}

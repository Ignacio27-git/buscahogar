// Paso 1.7 — configuración de vitest para la suite respaldada por
// PostgreSQL (diseño D2, resuelve D-a). Deliberadamente NO duplica
// docker-gate.ts: `test/setup-no-network.ts` no carga ningún .env, así que
// un describeWithDb copiado encontraría DATABASE_URL siempre ausente y
// OMITIRÍA el 100% de estos tests, en verde, para siempre. En su lugar,
// `test/db/setup-db-env.ts` LANZA cuando DATABASE_URL sigue ausente tras
// cargar el .env — una suite que se salta en silencio se vuelve imposible.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/db/**/*.test.ts'],
    environment: 'node',
    // Un único contenedor de PostgreSQL compartido por todos los ficheros
    // de esta suite (mismo motivo que packages/db/vitest.config.ts): en
    // paralelo interferirían de forma no determinista sobre los mismos datos.
    fileParallelism: false,
    // `setup-no-network.ts` va PRIMERO y se mantiene activo (REQ-NONET): esta
    // suite necesita una base de datos real, nunca la red. `setup-db-env.ts`
    // carga el .env, retira las credenciales de Idealista y lanza si
    // DATABASE_URL sigue ausente.
    // Decisión 245: crea y migra la base `_ingestion_test` una vez por ejecución.
    globalSetup: ['test/db/global-setup.ts'],
    setupFiles: ['test/setup-no-network.ts', 'test/db/setup-db-env.ts'],
  },
});

// ROADMAP 1.8 — configuración de vitest para la suite de bloqueo de
// candidatos, respaldada por PostgreSQL real (diseño D-T1). Vive en su
// propio fichero, no en `vitest.config.ts`, por el mismo motivo que
// `apps/ingestion/vitest.db.config.ts` (paso 1.7): `describeWithDb`
// (test/helpers/docker-gate.ts) OMITE en silencio sin contenedor, y una
// suite nueva nunca debe demostrar nada con un verde vacío. `setup-require-db.ts`
// LANZA cuando `DATABASE_URL` sigue ausente tras cargar el `.env`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/blocking/**/*.test.ts'],
    environment: 'node',
    // Mismo motivo que vitest.config.ts:13 — un único contenedor de
    // PostgreSQL compartido por todos los ficheros de esta suite.
    fileParallelism: false,
    setupFiles: ['./test/setup-env.ts', './test/blocking/setup-require-db.ts'],
  },
});

// ROADMAP 1.12 — configuración de vitest para la suite de detalle de
// vivienda (Q1/Q2, `detail.ts`), respaldada por PostgreSQL real. Cuarta
// config fail-loud del paquete, junto a `vitest.blocking.config.ts`
// (ROADMAP 1.8) y `vitest.consolidation.config.ts` (ROADMAP 1.10): reutiliza
// `test/blocking/setup-require-db.ts` TAL CUAL, sin moverlo ni renombrarlo —
// mismo criterio que 1.10 dio para no tocar la suite ya publicada del 1.8
// solo por estética. `describeWithDb` (test/helpers/docker-gate.ts) OMITE en
// silencio sin contenedor: esta suite nueva no puede demostrar nada con un
// verde vacío.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/detail/**/*.test.ts'],
    environment: 'node',
    // Mismo motivo que vitest.config.ts/vitest.blocking.config.ts/
    // vitest.consolidation.config.ts: un único contenedor de PostgreSQL
    // compartido por todos los ficheros de esta suite.
    fileParallelism: false,
    // Decisión 245: crea y migra la base `_db_test` una vez por ejecución (no se hereda).
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts', './test/blocking/setup-require-db.ts'],
  },
});

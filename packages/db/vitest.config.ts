import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Este workspace todavía no tiene lógica que probar. Se prefiere no tener
    // tests a tener tests tautológicos que den un verde sin valor.
    passWithNoTests: true,
    // La Fase 3 (suite de integración) comparte un único contenedor de
    // PostgreSQL entre todos los ficheros de test; ejecutarlos en paralelo
    // interferiría de forma no determinista sobre los mismos datos.
    fileParallelism: false,
    // Carga `DATABASE_URL` desde el `.env` de la raíz antes de cada fichero
    // de test, sin que este paquete lea ni imprima su contenido (ver
    // `test/setup-env.ts`).
    setupFiles: ['./test/setup-env.ts'],
    // ROADMAP 1.8 (diseño D-T1): la suite de bloqueo vive en su propia
    // config (vitest.blocking.config.ts, script `test:blocking`) porque es
    // fail-loud (lanza sin DATABASE_URL) en vez de silenciosamente-omitida
    // como `describeWithDb` — así `pnpm --filter @buscahogar/db test` no la
    // ejecuta dos veces ni cambia su semántica actual.
    // ROADMAP 1.10 (diseño D10): mismo motivo para la suite de
    // consolidación (vitest.consolidation.config.ts, script
    // `test:consolidation`) — también fail-loud.
    // ROADMAP 1.12: mismo motivo para la suite de detalle de vivienda
    // (vitest.detail.config.ts, script `test:detail`) — también fail-loud.
    exclude: ['test/blocking/**', 'test/consolidation/**', 'test/detail/**'],
  },
});

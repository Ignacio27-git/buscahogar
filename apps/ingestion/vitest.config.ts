import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Este workspace todavía no tiene lógica que probar. Se prefiere no tener
    // tests a tener tests tautológicos que den un verde sin valor.
    passWithNoTests: true,
    // Sonda de la API de Idealista (paso 1.5): la suite no debe poder tocar
    // la red bajo ningún concepto (REQ-NONET, D9).
    setupFiles: ['test/setup-no-network.ts'],
    // Paso 1.7 (diseño D2): la suite respaldada por PostgreSQL vive en su
    // propia config (vitest.db.config.ts, script `test:db`) para que
    // `pnpm test` — y por tanto `pnpm -r test` en la raíz — se quede
    // siempre offline.
    exclude: ['test/db/**'],
  },
});

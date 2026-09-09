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
  },
});

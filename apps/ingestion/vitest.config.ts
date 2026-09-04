import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Este workspace todavía no tiene lógica que probar. Se prefiere no tener
    // tests a tener tests tautológicos que den un verde sin valor.
    passWithNoTests: true,
  },
});

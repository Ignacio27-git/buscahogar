// ROADMAP 1.10 (diseño D10) — configuración de vitest para la suite de
// consolidación de propiedades canónicas (hidratación + escritura
// transaccional), respaldada por PostgreSQL real. Tercera config fail-loud
// del paquete, junto a `vitest.blocking.config.ts` (ROADMAP 1.8): reutiliza
// `test/blocking/setup-require-db.ts` TAL CUAL, sin moverlo ni renombrarlo
// — su ruta bajo `test/blocking/` es engañosa para esta suite nueva, pero
// moverlo tocaría la suite ya publicada de 1.8 solo por estética (D10 del
// diseño). `describeWithDb` (test/helpers/docker-gate.ts) OMITE en
// silencio sin contenedor: esta suite nueva no puede demostrar nada con un
// verde vacío.
//
// `setupFiles` incluye TAMBIÉN `./test/setup-env.ts` (carga `DATABASE_URL`
// desde el `.env` de la raíz) — sin él, `setup-require-db.ts` lanzaría
// SIEMPRE, incluso con el contenedor sano, porque nada habría cargado la
// variable todavía. `vitest.blocking.config.ts:17` ya combina ambos en
// ese orden; esta config replica exactamente esa combinación.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/consolidation/**/*.test.ts'],
    environment: 'node',
    // Mismo motivo que vitest.config.ts/vitest.blocking.config.ts: un único
    // contenedor de PostgreSQL compartido por todos los ficheros de esta
    // suite.
    fileParallelism: false,
    setupFiles: ['./test/setup-env.ts', './test/blocking/setup-require-db.ts'],
  },
});

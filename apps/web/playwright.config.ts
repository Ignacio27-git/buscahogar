// Paso D.1a (specs visual-regression-suite R6/R7/R10/R11 y e2e-test-database R5;
// diseño «Playwright config», A4; decisiones 135-137) — configuración del e2e
// visual y de accesibilidad. Solo es autoritativo DENTRO del contenedor
// `e2e` de Docker (imagen de Playwright fijada, Linux): los baselines de
// capturas dependen del sistema operativo y de las fuentes.
import { defineConfig } from '@playwright/test';
import { assertE2eWebDatabaseUrl } from '@buscahogar/db/e2e';

// 127.0.0.1, no `localhost`: evita resoluciones IPv6 distintas entre host y
// contenedor y fija un origen exacto para el guard de red (`network-policy.ts`).
const APP_PORT = 3100;
const APP_ORIGIN = `http://127.0.0.1:${String(APP_PORT)}`;

// El proceso de Playwright NUNCA debe tener la credencial de propietario: el
// webServer hereda `process.env` (`{...DEFAULT_ENV, ...process.env, ...env}`,
// verificado en 1.63.0), así que no basta con no pasarla en `env`. El
// entrypoint la elimina con `env -u`; esta aserción lo comprueba (spec S5.1).
if (process.env.E2E_DATABASE_URL !== undefined) {
  throw new Error(
    'E2E_DATABASE_URL (credencial de propietario) está definida en el proceso de Playwright. ' +
      'Debe eliminarse antes de arrancar: `env -u E2E_DATABASE_URL playwright test` (docker-entrypoint.sh).'
  );
}

// Única URL de base de datos del servidor Next: rol de solo lectura sobre la base `_e2e`.
const webDatabaseUrl = process.env.E2E_WEB_DATABASE_URL;
assertE2eWebDatabaseUrl(webDatabaseUrl);

const VIEWPORTS = {
  w320: { width: 320, height: 720 },
  w768: { width: 768, height: 1024 },
  w1280: { width: 1280, height: 800 },
} as const;
const COLOR_SCHEMES = ['light', 'dark'] as const;

// 3 anchos x 2 esquemas = 6 proyectos (S6.1). El nombre se usa en la ruta del baseline.
const projects = Object.entries(VIEWPORTS).flatMap(([width, viewport]) =>
  COLOR_SCHEMES.map((colorScheme) => ({
    name: `${width}-${colorScheme}`,
    use: { viewport, colorScheme },
  }))
);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // `none`: un baseline que falta FALLA sin escribirse. Solo `test:e2e:update`
  // (`--update-snapshots=changed` por CLI, que prevalece) escribe baselines.
  updateSnapshots: 'none',
  // Sin plataforma en la ruta (R10/S10.1): solo hay baselines de Linux/Docker.
  snapshotPathTemplate: '{testDir}/baselines/screenshots/{projectName}/{arg}{ext}',
  retries: 0,
  // Fusiona las huellas axe preparadas en una ejecución de actualización (D.1b).
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: APP_ORIGIN,
    reducedMotion: 'reduce',
    locale: 'es-ES',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    deviceScaleFactor: 1,
  },
  projects,
  webServer: {
    // `next build && next start`, no `next dev`: sin overlay de desarrollo y con la
    // CSP de producción (decisión 136). `reuseExistingServer: false`: un
    // `dev:web` contra la base de desarrollo nunca debe reutilizarse.
    command: `pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port ${String(APP_PORT)}`,
    url: APP_ORIGIN,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: webDatabaseUrl,
      // Las credenciales de escritura acotadas se anulan aunque el entorno las
      // heredase: el e2e solo lee, y la ruta `?q=` no escribe (decisión 122).
      WEB_DATABASE_URL: '',
      WEB_COVERAGE_DATABASE_URL: '',
    },
  },
});

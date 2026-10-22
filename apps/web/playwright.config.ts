// Paso D.1a (specs visual-regression-suite R6/R7/R10/R11 y e2e-test-database R5;
// diseño «Playwright config», A4; decisiones 135-137) — configuración del e2e
// visual y de accesibilidad. Solo es autoritativo DENTRO del contenedor
// `e2e` de Docker (imagen de Playwright fijada, Linux): los baselines de
// capturas dependen del sistema operativo y de las fuentes.
import { defineConfig } from '@playwright/test';
import { assertE2eWebDatabaseUrl, e2eLimiterDatabaseUrl } from '@buscahogar/db/e2e';

// 127.0.0.1, no `localhost`: evita resoluciones IPv6 distintas entre host y
// contenedor y fija un origen exacto para el guard de red (`network-policy.ts`).
const APP_PORT = 3100;
const APP_ORIGIN = `http://127.0.0.1:${String(APP_PORT)}`;
// D.14 (decisión 189): segundo servidor con el limitador del proxy activo y tope 1, solo para
// `e2e/rate-limit.spec.ts`. El de 3100 lo deja desactivado (sin `CLIENT_IP_HEADER`).
const LIMITED_PORT = 3101;
const LIMITED_ORIGIN = `http://127.0.0.1:${String(LIMITED_PORT)}`;

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

// ROADMAP 3.4 (decisión 265, enmienda la 135): solo el servidor «limitado» recibe una segunda
// credencial, la del rol e2e-only que el seed crea con S/I/U/D únicamente sobre `proxy_rate_limit`.
// Se deriva de la URL de lectura (misma base `_e2e`); no es la credencial de producción ni de propietario.
const limiterDatabaseUrl = e2eLimiterDatabaseUrl(webDatabaseUrl);

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
  // Playwright arranca las entradas en orden: la primera construye `.next` y la segunda solo lo
  // sirve (`next start` sin `next build`).
  webServer: [
    {
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
        // heredase: este servidor solo lee (decisión 135), y la ruta `?q=` no escribe (decisión 122).
        // La única escritura del e2e son los contadores del limitador, en el servidor de 3101 (decisión 265).
        WEB_DATABASE_URL: '',
        WEB_COVERAGE_DATABASE_URL: '',
        // D.13 (decisión 181): las rutas `?zone=` leen el tope diario de zonas nuevas, que la página
        // exige y nunca inventa. Con 1, el job pendiente sembrado «hoy» ya lo agota y la zona sin
        // job (`coverage-cap`) muestra el aviso del tope global sin intentar escribir.
        NEW_ZONES_DAILY_CAP: '1',
        // El limitador por IP queda desactivado en este servidor (decisión 078): el resto del e2e
        // no debe toparse con un 429.
        CLIENT_IP_HEADER: '',
      },
    },
    {
      // D.14 (decisión 189): mismo build, limitador activo con tope 1 por ventana larga. Valores de
      // prueba, no secretos. La URL de disponibilidad es `/icon.svg`, que el matcher del proxy
      // excluye: comprobar que el servidor está listo no consume el cupo.
      command: `pnpm exec next start --hostname 127.0.0.1 --port ${String(LIMITED_PORT)}`,
      url: `${LIMITED_ORIGIN}/icon.svg`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: webDatabaseUrl,
        WEB_DATABASE_URL: '',
        // Limitador en PostgreSQL (decisión 255): sin esta credencial falla abierto y nunca emite 429.
        WEB_COVERAGE_DATABASE_URL: limiterDatabaseUrl,
        NEW_ZONES_DAILY_CAP: '1',
        CLIENT_IP_HEADER: 'x-e2e-client-ip',
        CLIENT_IP_HMAC_KEY: 'e2e-only-hmac-key-not-a-secret-0123456789',
        COVERAGE_PER_CLIENT_DAILY_CAP: '100',
        PROXY_RATE_LIMIT_MAX: '1',
        PROXY_RATE_LIMIT_WINDOW_SECONDS: '3600',
      },
    },
  ],
});

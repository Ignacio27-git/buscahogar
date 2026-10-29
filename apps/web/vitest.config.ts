import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mismo alias `@/*` → `./src/*` que `tsconfig.json:15-17`. `tsc` y
  // Turbopack lo resuelven solos desde `paths`; Vite/vitest no lee
  // `tsconfig.json` por sí mismo, así que un fichero bajo `test/**` que
  // importe (aunque sea transitivamente, a través de `page.tsx`) cualquier
  // módulo con un especificador `@/…` fallaría en resolución sin este
  // alias explícito. Ningún test lo necesitó hasta ROADMAP 1.12 (task 3.13)
  // porque hasta ahora ningún fichero bajo `test/**` importaba `page.tsx`
  // ni nada que este importe.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // ROADMAP 1.15 (security-hardening, diseño decisión 081) — el
      // paquete real `server-only` lanza fuera del runtime de servidor de
      // Next.js; este alias lo sustituye por un doble vacío
      // (`test/stubs/server-only.ts`) solo para el pipeline de vitest.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      // D.19 (decisión 230) — `next/font/local` solo funciona dentro de la compilación de Next.js; este
      // alias lo sustituye por un doble (`test/stubs/next-font-local.ts`) solo en vitest.
      'next/font/local': fileURLToPath(new URL('./test/stubs/next-font-local.ts', import.meta.url)),
    },
  },
  // `apps/web/tsconfig.json` fija `jsx: "preserve"` porque el propio pipeline
  // SWC/webpack de Next.js lo necesita (no tocar). Vite 8 (basado en
  // Rolldown/oxc, versión fijada transitivamente por vitest 5.0.0) deriva su
  // propia transformación JSX de ese mismo tsconfig y, al ver "preserve",
  // deja el JSX literal en el módulo "transformado" — lo cual no es JS
  // válido y el análisis de imports de Vite lo rechaza. Este override de
  // `oxc.jsx` (no `esbuild.jsx`: Vite 8 ignora `esbuild` cuando `oxc` está
  // presente) sustituye esa derivación SOLO para el pipeline de vitest, sin
  // modificar tsconfig.json. Ver docs/AI-NOTES.md para el diagnóstico
  // completo (AR-9, ROADMAP 1.12).
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    // Este workspace todavía no tiene lógica que probar. Se prefiere no tener
    // tests a tener tests tautológicos que den un verde sin valor.
    passWithNoTests: true,
    // ROADMAP 1.13 Unit D — carga `DATABASE_URL`/`WEB_COVERAGE_DATABASE_URL`
    // desde el `.env` de la raíz antes de cada fichero (test/setup-env.ts,
    // mismo patrón que packages/db/vitest.config.ts). Las pruebas DB-backed
    // de esta unidad (`test/db/*.test.ts`) se OMITEN por sí solas
    // (describeWithDb/describeWithCoverageDb) cuando la variable
    // correspondiente no está definida — nunca fallan por su ausencia.
    // Decisión 245: crea y migra la base `_web_test` (y sus GRANT) una vez por ejecución.
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Las pruebas DB-backed de esta unidad comparten el mismo contenedor de
    // PostgreSQL; ejecutarlas en paralelo interferiría de forma no
    // determinista sobre los mismos datos — mismo motivo que
    // packages/db/vitest.config.ts.
    fileParallelism: false,
  },
});

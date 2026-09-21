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
  },
});

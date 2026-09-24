// Reexporta la configuración ESLint compartida del monorepo, indicando la raíz
// de este workspace para que el análisis con información de tipos la resuelva.
import { createSharedConfig } from '@buscahogar/config/eslint.config.mjs';

// Frontera de dependencias de packages/core (ROADMAP 1.4): el dominio no puede
// ver Next, React ni el ORM. Hasta ahora esto solo estaba protegido por la
// ausencia de la dependencia en package.json y por una línea de revisión manual
// en la hoja de ruta; esta regla lo convierte en algo que `pnpm lint` detecta.
//
// Variante typescript-eslint, no la de ESLint base: en la versión instalada
// `allowTypeImports` es opt-in y por defecto vale `false`, así que un
// `import type` de un módulo prohibido también queda bloqueado — justo el
// tipo de fuga "inofensiva en apariencia" que erosiona la frontera sin que
// nada lo detecte. `no-restricted-imports` base no está habilitada en
// ningún sitio del monorepo, así que no hace falta un `'off'` compañero.
//
// `test/**` está incluido a propósito: una frontera que se cumple en src/
// pero no en los tests no es una frontera — un test que importa drizzle-orm
// para montar un fixture convertiría al ORM en una dependencia real del
// paquete sin que nadie lo note.
export default [
  ...createSharedConfig(import.meta.dirname),
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'packages/core es dominio puro: no puede importar Next.',
            },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'packages/core es dominio puro: no puede importar React.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*'],
              message:
                'packages/core no conoce el ORM; los tipos de persistencia viven en packages/db.',
            },
            {
              group: ['@buscahogar/db', '@buscahogar/db/*'],
              message: 'La dependencia va de db hacia core, nunca al revés.',
            },
            {
              group: ['**/apps/**'],
              message: 'packages/core no puede importar de apps/.',
            },
          ],
        },
      ],
    },
  },
];

// Configuración ESLint compartida del monorepo.
//
// Flat config para ESLint 10 + typescript-eslint 8.x (paquete unificado).
// No se usa @eslint/js: su versionado se ha desacoplado del núcleo de ESLint
// y el conjunto "strictTypeChecked" de typescript-eslint ya cubre los errores
// base en una base de código exclusivamente TypeScript.
//
// Se usa el conjunto CON información de tipos (strictTypeChecked), no el
// puramente sintáctico. Es lo que permite que corran reglas como
// no-floating-promises, imprescindible en la ingesta asíncrona y en las
// consultas a base de datos.
//
// Se exporta como factoría porque el análisis con tipos necesita saber la raíz
// del workspace que se está analizando (tsconfigRootDir), y este fichero vive en
// packages/config: typescript-eslint no puede deducirla por sí solo.
//
// Uso desde cada workspace:
//   import { createSharedConfig } from '@buscahogar/config/eslint.config.mjs';
//   export default createSharedConfig(import.meta.dirname);

import tseslint from 'typescript-eslint';

/** Rutas que nunca se analizan, en cualquier workspace. */
export const sharedIgnores = ['**/node_modules/', '**/dist/', '**/dist-runtime/', '**/.next/', '**/coverage/'];

/** Ficheros de configuración: se lintan, pero sin reglas que exijan tipos. */
export const configFilePatterns = ['**/*.config.ts', '**/*.config.mjs', '**/*.config.js'];

/** Reglas propias del proyecto, por encima de strictTypeChecked. */
export const sharedRules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  // Error, no warning: un warning no rompe `pnpm lint` y acaba siendo decorativo.
  '@typescript-eslint/explicit-function-return-type': 'error',
};

/**
 * Bloques comunes a todos los workspaces.
 *
 * @param {string} tsconfigRootDir Raíz del workspace (normalmente import.meta.dirname).
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function sharedBlocks(tsconfigRootDir) {
  return tseslint.config(
    {
      languageOptions: {
        parserOptions: {
          // projectService resuelve el tsconfig de cada fichero automáticamente.
          // allowDefaultProject cubre los ficheros de configuración de la raíz
          // del workspace, que quedan fuera del "include" del tsconfig.
          projectService: {
            allowDefaultProject: ['*.config.ts', '*.config.mjs', '*.config.js'],
          },
          tsconfigRootDir,
        },
      },
      rules: sharedRules,
    },
    {
      files: configFilePatterns,
      extends: [tseslint.configs.disableTypeChecked],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    }
  );
}

/**
 * Configuración completa para un workspace sin necesidades adicionales
 * (packages/core, packages/db, apps/ingestion).
 *
 * @param {string} tsconfigRootDir Raíz del workspace (normalmente import.meta.dirname).
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createSharedConfig(tsconfigRootDir) {
  return tseslint.config(
    { ignores: sharedIgnores },
    ...tseslint.configs.strictTypeChecked,
    ...sharedBlocks(tsconfigRootDir)
  );
}

// ESLint (flat config) para apps/web.
//
// Combina TRES fuentes, en este orden:
//   1. strictTypeChecked de typescript-eslint más los bloques compartidos de
//      @buscahogar/config. Es lo que garantiza que web se linte con el mismo
//      rigor que packages/core y apps/ingestion.
//   2. eslint-config-next/typescript, para la resolución de módulos de Next.
//   3. @next/eslint-plugin-next, con sus rule-sets recommended y core-web-vitals.
//
// Next 16 elimina `next lint`: se ejecuta el CLI de ESLint directamente.
//
// No se usa `eslint-config-next/core-web-vitals` porque arrastra
// eslint-plugin-react@7.37.5, que llama a `context.getFilename()` (eliminado en
// ESLint 10) y rompe el lint. Ver docs/DECISIONS.md (011) y docs/AI-NOTES.md.

import nextPlugin from '@next/eslint-plugin-next';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

import { sharedBlocks, sharedIgnores } from '@buscahogar/config/eslint.config.mjs';

export default tseslint.config(
  { ignores: [...sharedIgnores, '.next/', 'out/', 'build/', 'next-env.d.ts'] },
  ...tseslint.configs.strictTypeChecked,
  ...nextTs,
  {
    name: 'next/plugin-rules',
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  // Al final, para que las reglas compartidas prevalezcan sobre las de Next.
  ...sharedBlocks(import.meta.dirname)
);

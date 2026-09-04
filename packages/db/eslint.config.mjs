// Reexporta la configuración ESLint compartida del monorepo, indicando la raíz
// de este workspace para que el análisis con información de tipos la resuelva.
import { createSharedConfig } from '@buscahogar/config/eslint.config.mjs';

export default createSharedConfig(import.meta.dirname);

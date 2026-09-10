// Reexporta la configuración ESLint compartida del monorepo, indicando la raíz
// de este workspace para que el análisis con información de tipos la resuelva.
import { createSharedConfig } from '@buscahogar/config/eslint.config.mjs';

const SIN_BUCLES = 'Sin bucles en la sonda: cada iteración sería una petición facturable.';

export default [
  ...createSharedConfig(import.meta.dirname),
  {
    // Garantía estructural del paso 1.5 (D5): se comprueba sobre el AST, no
    // con un grep sobre el texto, que daría falsos positivos con los
    // comentarios en español o con literales de cadena. No cubre recursión
    // ni `.map`/`.forEach` sobre peticiones — de eso se encarga el tope duro
    // del contador de peticiones (scripts/probe/ledger.ts, D6).
    files: ['scripts/probe-idealista.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ForStatement', message: SIN_BUCLES },
        { selector: 'ForOfStatement', message: SIN_BUCLES },
        { selector: 'ForInStatement', message: SIN_BUCLES },
        { selector: 'WhileStatement', message: SIN_BUCLES },
        { selector: 'DoWhileStatement', message: SIN_BUCLES },
      ],
    },
  },
];

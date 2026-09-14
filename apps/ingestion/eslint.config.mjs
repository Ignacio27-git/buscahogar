// Reexporta la configuración ESLint compartida del monorepo, indicando la raíz
// de este workspace para que el análisis con información de tipos la resuelva.
import { createSharedConfig } from '@buscahogar/config/eslint.config.mjs';

const SIN_BUCLES = 'Sin bucles en las superficies que emiten peticiones: cada iteración sería una petición facturable.';

export default [
  ...createSharedConfig(import.meta.dirname),
  {
    // Garantía estructural del paso 1.5 (D5), extendida en el paso 1.6 al
    // adaptador de Idealista (diseño D6, Reconciliación #3 de las tareas):
    // se comprueba sobre el AST, no con un grep sobre el texto, que daría
    // falsos positivos con los comentarios en español o con literales de
    // cadena. El ban sigue la SUPERFICIE que emite peticiones, no el
    // paquete completo — los módulos puros del adaptador (planner,
    // normalizador, mapas…) sí iteran arrays y no deben quedar bloqueados.
    // No cubre recursión ni `.map`/`.forEach` sobre peticiones — de eso se
    // encarga el tope duro del presupuesto (budget.ts / scripts/probe/ledger.ts, D6).
    files: [
      'scripts/probe-idealista.ts',
      'src/sources/idealista/http-client.ts',
      'src/sources/idealista/idealista-source.ts',
    ],
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

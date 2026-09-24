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
      // Paso 1.14 (diseño D14) — mismo criterio: superficies que orquestan
      // la única petición del adaptador de Kyero.
      'src/sources/kyero/kyero-source.ts',
      'src/sources/kyero/http-feed-fetcher.ts',
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
  {
    // ROADMAP 1.10 (diseño D11, CHK-NOSOURCES-LINT): el reproceso de
    // deduplicación no consulta ninguna fuente externa — cero peticiones,
    // cero cuota (REPRO-1). Variante typescript-eslint, no la de ESLint
    // base, mismo motivo que packages/core/eslint.config.mjs:10-15: en la
    // versión instalada `allowTypeImports` es opt-in y por defecto vale
    // `false`, así que un `import type` de un módulo de fuentes también
    // queda bloqueado. Verificado en la propia tarea de aplicación
    // (CHK-NOSOURCES-LINT, tarea 4.8) con una violación deliberada: el
    // patrón `'**/sources/**'` SÍ coincide contra el texto del especificador
    // de una importación relativa como `../src/sources/idealista/
    // idealista-source.js` bajo el minimatch instalado — no hizo falta el
    // fallback a formas relativas literales que el diseño dejaba previsto.
    // Lo que esto prueba y lo que no (D11, honesto): es un ban DIRECTO sobre
    // el texto del especificador, no sobre el grafo de módulos resuelto —
    // no cubre un import transitivo a través de otro módulo, ni un import
    // muerto que la ejecución real nunca alcanza (eso lo prueba en tiempo
    // de ejecución D12, test/db/reprocess-dedup.db.test.ts). Ninguna de las
    // dos pruebas basta por sí sola; juntas sí.
    files: ['scripts/reprocess-dedup.ts', 'src/dedup/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sources/**', '../src/sources/*', './sources/*'],
              message:
                'El reproceso no consulta ninguna fuente externa: cero peticiones y cero cuota (ROADMAP 1.10).',
            },
          ],
        },
      ],
    },
  },
];

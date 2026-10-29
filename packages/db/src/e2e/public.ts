// Barril del subpath `@buscahogar/db/e2e` (diseño A2). Solo módulos PUROS: el
// seed (`seed.ts`, que abre conexiones y hace DROP DATABASE) NO se exporta
// aquí, y `apps/web` nunca puede alcanzarlo.
export * from './fixture-ids.js';
export * from './guard.js';

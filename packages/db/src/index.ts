// Agregador inmobiliario — esquema y cliente de base de datos
//
// Este paquete contiene:
// - Esquema Drizzle de las tablas
// - Cliente de base de datos
// - Migraciones
//
// Depende de @buscahogar/core para tipos compartidos: hasta ROADMAP 1.4 esta
// dependencia estaba declarada en package.json pero ningún fichero la
// importaba. Ahora es real — `src/types.ts` reexporta `SignalScore` y
// `SignalBreakdown` desde `@buscahogar/core` en vez de declararlos a mano
// (docs/DECISIONS.md, decisión 031). Es una reexportación de solo tipos
// (`export type`), erasable en compilación: no añade ninguna dependencia en
// runtime.
// Importado por apps/web y apps/ingestion para acceder a la base de datos.
// `src/seed.ts` NO se exporta desde aquí: es un punto de entrada de línea de
// comandos, no una API de librería (ver comentario en ese fichero).

export * from './tables.js';
export * from './types.js';
export * from './spatial.js';
export * from './blocking.js';
export * from './hydration.js';
export * from './consolidation.js';
export * from './search.js';
export * from './search-map.js';
export * from './detail.js';
export * from './locations-query.js';
export * from './time.js';
export * from './budget-ledger.js';
export * from './presweep.js';
export * from './client-quota.js';
export * from './proxy-rate-limit.js';
export * from './query-signals.js';
export * from './zone-lifecycle.js';
export * from './zone-purge.js';
export * from './tombstone.js';
export * from './visibility.js';
export * from './presence-checks.js';
export * from './coverage.js';
export * from './bind-parameters.js';
export * from './ping.js';
export { createDb, type Database, type DbPoolOptions } from './db.js';

export const DB_VERSION = '0.0.1';

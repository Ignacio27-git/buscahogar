// Agregador inmobiliario — esquema y cliente de base de datos
//
// Este paquete contiene:
// - Esquema Drizzle de las tablas
// - Cliente de base de datos
// - Migraciones
//
// Depende de @buscahogar/core para tipos compartidos.
// Importado por apps/web y apps/ingestion para acceder a la base de datos.
// `src/seed.ts` NO se exporta desde aquí: es un punto de entrada de línea de
// comandos, no una API de librería (ver comentario en ese fichero).

export * from './tables.js';
export * from './types.js';
export * from './spatial.js';
export { createDb, type Database } from './db.js';

export const DB_VERSION = '0.0.1';

// Agregador inmobiliario — worker de ingesta
//
// Responsabilidades:
// - Barrido de APIs de fuentes (Idealista, etc.)
// - Normalización a esquema común
// - Persistencia en listings
// - Deduplicación
// - Consolidación de viviendas canónicas
// - Refresco periódico y retención

import { fileURLToPath } from 'node:url';

// Paso 1.6 — adaptador de la primera fuente (Idealista) y su normalizador.
// Barril interno al workspace (no un paquete consumido por otros), así que
// se reexporta con `export *`, igual que packages/db/src/index.ts.
export * from './sources/idealista/index.js';

export const INGESTION_VERSION = '0.0.1';

export function main(): void {
  console.log(`Ingestion worker v${INGESTION_VERSION}`);
  console.log('Esperando implementación en los pasos posteriores de la hoja de ruta');
}

// Se ejecuta solo como entrypoint (pnpm dev / start), no al importarlo desde los
// tests. Se usa fileURLToPath en lugar de import.meta.filename porque este último
// no existe antes de Node 20.11 y devolvería undefined en silencio.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

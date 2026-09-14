// Paso 1.7 — duplicado deliberado de packages/db/test/helpers/db-client.ts
// (diseño D2, resuelve D-a). `packages/db/src/index.ts` documenta que los
// puntos de entrada de solo-test/CLI no se exportan como API pública, así
// que promover ese fichero a superficie exportada metería una preocupación
// de test dentro de la API de un paquete de runtime. Precedente: scrub-
// credentials.ts (docs/DECISIONS.md 033/034) también eligió duplicar antes
// que acoplar tests entre paquetes. A diferencia del original, `createDb` y
// `Database` llegan aquí desde `@buscahogar/db` (paquete, no ruta relativa)
// porque `apps/ingestion` ya lo declara como dependencia (tarea 2.1).
import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import type { Pool } from 'pg';

export function connectTestDb(): { db: Database; pool: Pool } {
  return createDb(process.env.DATABASE_URL ?? '');
}

// Mismo orden que el original: respeta las claves foráneas del esquema
// compartido. CASCADE cubre cualquier referencia añadida más adelante.
const TABLES_IN_FK_ORDER = [
  'property_listings',
  'listing_features',
  'listing_versions',
  'coverage_jobs',
  'listings',
  'properties',
  'zones',
  'sources',
  'locations',
  'features',
] as const;

// Vacía todas las tablas de aplicación entre tests y reinicia los
// contadores de identidad. No toca las tablas propias de PostGIS.
export async function truncateAll(pool: Pool): Promise<void> {
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

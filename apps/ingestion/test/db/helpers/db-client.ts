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
import { assertConnectedToTestDatabase } from '@buscahogar/db/test-database';
import type { Database } from '@buscahogar/db';
import type { Pool } from 'pg';

export function connectTestDb(): { db: Database; pool: Pool } {
  return createDb(process.env.DATABASE_URL ?? '');
}

// Mismo orden que el original: respeta las claves foráneas del esquema
// compartido. CASCADE cubre cualquier referencia añadida más adelante.
//
// ROADMAP 1.10: `dedup_pair_evidence`/`dedup_runs` se añaden aquí de forma
// explícita, mismo fallo y mismo arreglo ya documentados en
// `packages/db/test/helpers/db-client.ts` (Unit C, obs #164): `dedup_pair_
// evidence` ya quedaba vaciada de rebote por el CASCADE de `listings`
// (referencia `listings.id`), pero `dedup_runs` no tiene ninguna fila en
// esta lista que la referencie, así que sin este añadido sus filas
// sobrevivirían entre tests del mismo fichero — el nuevo
// `test/db/reprocess-dedup.db.test.ts` (D12) escribe ambas tablas en cada
// corrida.
const TABLES_IN_FK_ORDER = [
  'property_listings',
  'dedup_pair_evidence',
  'listing_features',
  'listing_versions',
  // ROADMAP 2.5 (S3): cola de presencia; referencia listings y zones.
  'listing_presence_checks',
  'coverage_jobs',
  'listings',
  'properties',
  'dedup_runs',
  // ROADMAP 3.3: registro mensual de cuota; referencia `sources` (va antes).
  'monthly_request_budget',
  // ROADMAP 3.4 (decisión 259): deduplicación duradera de avisos; sin claves foráneas.
  'alert_dispatch_log',
  'zones',
  'sources',
  'locations',
  'features',
] as const;

// Vacía todas las tablas de aplicación entre tests y reinicia los
// contadores de identidad. No toca las tablas propias de PostGIS.
export async function truncateAll(pool: Pool): Promise<void> {
  // Decisión 245: última barrera, la conexión REAL debe ser a una base `_test`.
  await assertConnectedToTestDatabase(pool);
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

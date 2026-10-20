// Ayudante compartido de conexión para la suite de integración (Fase 3,
// Docker-gated). Cada fichero de test abre y cierra su propia conexión en
// `beforeAll`/`afterAll`: con `fileParallelism: false` los ficheros se
// ejecutan en serie, pero cada uno se aísla en su propio contexto de
// módulos, así que no conviene compartir un `Pool` a nivel de módulo entre
// ficheros distintos.
import type { Pool } from 'pg';
import { createDb } from '../../src/db.js';
import { assertConnectedToTestDatabase } from '../../src/test-database.js';
import type { Database } from '../../src/db.js';

export function connectTestDb(): { db: Database; pool: Pool } {
  return createDb(process.env.DATABASE_URL ?? '');
}

// Todas las tablas de aplicación, en un orden que respeta las claves
// foráneas. `CASCADE` cubre cualquier referencia que se añada más adelante;
// el orden explícito documenta la jerarquía real del esquema (CLAUDE.md).
//
// ROADMAP 1.10: `dedup_pair_evidence`/`dedup_runs` se añaden aquí de forma
// explícita. `dedup_pair_evidence` ya quedaba vaciada de rebote por el
// CASCADE de `listings` (referencia `listings.id`), pero `dedup_runs` no
// tiene ninguna fila en esta lista que la referencie, así que sin este
// añadido sus filas sobrevivían entre tests dentro del mismo fichero —
// exactamente el fallo que detectó `test/consolidation/consolidation.test.ts`
// (los recuentos absolutos de `dedup_runs` no cuadraban entre tests).
//
// ROADMAP 1.13 (diseño DD-12): `daily_request_budget` referencia `sources`
// y nada más la referencia a ella — se añade antes de `sources` por la
// misma razón que `coverage_jobs` se lista antes de `zones`/`sources`.
//
// ROADMAP 1.15 (security-hardening): `coverage_client_quota` no referencia
// ninguna otra tabla (su PK es `(key_hash, day)`, ninguna FK) — se añade
// aquí sin ninguna restricción de orden real, junto a los otros contadores
// independientes de `sources`/`zones`.
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
  'daily_request_budget',
  // ROADMAP 3.3: registro mensual de cuota; referencia `sources` (va antes).
  'monthly_request_budget',
  'coverage_client_quota',
  // ROADMAP 2.5 (S1): referencia `zones` (ON DELETE CASCADE) — va antes.
  'zone_query_signals',
  'zones',
  'sources',
  'locations',
  'features',
] as const;

// Vacía todas las tablas de aplicación entre tests y reinicia los
// contadores de identidad. No toca las tablas propias de PostGIS
// (`geometry_columns`, `geography_columns`, `spatial_ref_sys`).
export async function truncateAll(pool: Pool): Promise<void> {
  // Decisión 245: última barrera, la conexión REAL debe ser a una base `_test`.
  await assertConnectedToTestDatabase(pool);
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

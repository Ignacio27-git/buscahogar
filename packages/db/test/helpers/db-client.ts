// Ayudante compartido de conexión para la suite de integración (Fase 3,
// Docker-gated). Cada fichero de test abre y cierra su propia conexión en
// `beforeAll`/`afterAll`: con `fileParallelism: false` los ficheros se
// ejecutan en serie, pero cada uno se aísla en su propio contexto de
// módulos, así que no conviene compartir un `Pool` a nivel de módulo entre
// ficheros distintos.
import type { Pool } from 'pg';
import { createDb } from '../../src/db.js';
import type { Database } from '../../src/db.js';

export function connectTestDb(): { db: Database; pool: Pool } {
  return createDb(process.env.DATABASE_URL ?? '');
}

// Todas las tablas de aplicación, en un orden que respeta las claves
// foráneas. `CASCADE` cubre cualquier referencia que se añada más adelante;
// el orden explícito documenta la jerarquía real del esquema (CLAUDE.md).
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
// contadores de identidad. No toca las tablas propias de PostGIS
// (`geometry_columns`, `geography_columns`, `spatial_ref_sys`).
export async function truncateAll(pool: Pool): Promise<void> {
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

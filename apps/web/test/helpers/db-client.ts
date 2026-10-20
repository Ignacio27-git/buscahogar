// ROADMAP 1.13 Unit D — ayudante de conexión para las pruebas DB-backed de
// `apps/web` (Docker-gated). Mismo patrón EXACTO que
// `packages/db/test/helpers/db-client.ts`, con las tablas realmente
// relevantes para esta unidad: `apps/web` nunca escribe `listings`/
// `properties`/etc., así que no hace falta truncarlas aquí.
//
// Usa el rol OWNER (`DATABASE_URL`) para sembrar y para orquestar — como
// hace el resto de la suite de integración del monorepo (`budget-ledger.test.ts`,
// `locations-query.test.ts`): la comprobación del rol INSERT-only
// RESTRINGIDO real vive aparte, en `test/db/coverage-role-privileges.test.ts`
// (gateada en `WEB_COVERAGE_DATABASE_URL`, todavía sin provisionar — R3).
import { createDb } from '@buscahogar/db';
import { assertConnectedToTestDatabase } from '@buscahogar/db/test-database';

// Tipo derivado de `createDb`, nunca un `import type { Pool } from 'pg'`
// directo: `pg` no es una dependencia declarada de `apps/web` (decisión
// 024/CLAUDE.md — las credenciales de fuentes/escritura son de
// `apps/ingestion`; `apps/web` solo depende de `@buscahogar/db`), así que
// añadir esa dependencia solo para un tipo sería una dependencia nueva sin
// necesidad real.
export type TestDbHandle = ReturnType<typeof createDb>;

export function connectTestDb(): TestDbHandle {
  return createDb(process.env.DATABASE_URL ?? '');
}

// ROADMAP 1.15 (security-hardening): `coverage_client_quota` se añade aquí
// junto a `coverage_jobs` — es la segunda tabla que `apps/web` escribe tras
// esta unidad (rol `web_coverage`, decisión 069/D1c). Ninguna FK propia
// (PK `(key_hash, day)`), así que su posición en esta lista no importa para
// el orden de claves foráneas.
// ROADMAP 2.5 (S1): `zone_query_signals` referencia `zones` — va antes.
const TABLES_IN_FK_ORDER = [
  'coverage_jobs',
  'coverage_client_quota',
  'zone_query_signals',
  'zones',
  'sources',
  'locations',
] as const;

export async function truncateAll(pool: TestDbHandle['pool']): Promise<void> {
  // Decisión 245: última barrera, la conexión REAL debe ser a una base `_test`.
  await assertConnectedToTestDatabase(pool);
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

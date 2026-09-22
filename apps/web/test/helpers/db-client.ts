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

const TABLES_IN_FK_ORDER = ['coverage_jobs', 'zones', 'sources', 'locations'] as const;

export async function truncateAll(pool: TestDbHandle['pool']): Promise<void> {
  const tableList = TABLES_IN_FK_ORDER.map((table) => `"${table}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

// ROADMAP 3.4 (decisión 257, D9; R5.1) — migraciones aplicadas por programa con el migrador de
// `drizzle-orm`, sin `drizzle-kit` en tiempo de ejecución (es una dependencia de desarrollo y no viaja en
// la imagen de despliegue). Usa el MISMO registro que `drizzle-kit migrate` (`drizzle.__drizzle_migrations`
// y los ficheros de `migrations/`), así que ambos caminos son intercambiables sobre una misma base.
// Este módulo no lee `process.env` (decisión 024): la conexión llega como parámetro y debe ser la URL
// DIRECTA (el DDL no funciona por un pooler en modo transacción, decisión 256).
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';

import type { Database } from './db.js';

// `src` y `dist` están a la misma profundidad, así que la misma ruta relativa vale para los dos. El
// paquete publica `migrations` en `files` para que exista también dentro de la imagen de despliegue.
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export interface MigrationReport {
  // Migraciones aplicadas EN ESTA ejecución (0 si la base ya estaba al día).
  readonly applied: number;
}

async function appliedCount(db: Database): Promise<number> {
  const { rows } = await db.execute<{ present: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`
  );
  if (rows[0]?.present !== true) {
    return 0;
  }
  const { rows: count } = await db.execute<{ total: string }>(
    sql`select count(*)::text as total from drizzle.__drizzle_migrations`
  );
  return Number(count[0]?.total ?? '0');
}

export async function runMigrations(db: Database, migrationsFolder: string = MIGRATIONS_FOLDER): Promise<MigrationReport> {
  const before = await appliedCount(db);
  await migrate(db, { migrationsFolder });
  const after = await appliedCount(db);
  return { applied: after - before };
}

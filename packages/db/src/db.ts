// Cliente de base de datos del paquete. Este módulo NUNCA lee `process.env`
// (docs/DECISIONS.md, decisión 024): la cadena de conexión llega siempre
// como parámetro, para que las credenciales solo puedan originarse en
// `apps/ingestion`, el único consumidor que las tiene (CLAUDE.md).
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './tables';

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

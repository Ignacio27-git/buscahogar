// Cliente de base de datos del paquete. Este módulo NUNCA lee `process.env`
// (docs/DECISIONS.md, decisión 024): la cadena de conexión llega siempre
// como parámetro, para que las credenciales solo puedan originarse en
// `apps/ingestion`, el único consumidor que las tiene (CLAUDE.md).
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import * as schema from './tables.js';

export type Database = NodePgDatabase<typeof schema>;

// Opciones de pool que el llamador puede fijar (decisión 256, ROADMAP 3.4): `apps/web` acota el tamaño
// del pool detrás del pooler de conexiones, y el limitador del proxy fija plazos de 150 ms. Es un
// subconjunto deliberado de `pg.PoolConfig`: nada de credenciales ni de `connectionString` aquí. Este
// módulo sigue sin leer `process.env`; el número llega siempre como parámetro.
export type DbPoolOptions = Pick<PoolConfig, 'max' | 'connectionTimeoutMillis' | 'query_timeout'>;

export function createDb(connectionString: string, poolOptions?: DbPoolOptions): { db: Database; pool: Pool } {
  const pool = new Pool({ ...poolOptions, connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

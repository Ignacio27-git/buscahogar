// Paso D.1a (spec e2e-test-database R1-R3; diseño «Seed», decisión 135) — reset
// DESTRUCTIVO y siembra determinista de la base de datos e2e (`*_e2e`). Es el
// único punto de entrada que hace `DROP DATABASE`, así que TODA validación del
// destino ocurre antes de crear cualquier conexión (guard.ts, puro).
//
// Tercera excepción documentada a la regla de que `packages/db` nunca lee
// `process.env` (tras `seed.ts` y `drizzle.config.ts`): es un punto de entrada
// de línea de comandos del e2e. NO se exporta desde `src/index.ts` ni desde el
// subpath `./e2e`: `apps/web` nunca puede alcanzarlo.
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { createDb } from '../db.js';
import type { Database } from '../db.js';
import {
  listingVersions,
  listings,
  locations,
  properties,
  propertyListings,
  sources,
  zones,
} from '../tables.js';
import { buildE2eFixture } from './fixture-data.js';
import { assertE2eOwnerDatabaseUrl, assertE2eWebDatabaseUrl, maintenanceUrl } from './guard.js';

// Rol de solo lectura que ya existe en el servidor (decisión 056): el seed
// NUNCA lo crea, solo le concede acceso a la base e2e (spec R2, S2.2).
const WEB_ROLE = 'web_readonly';

// `packages/db/migrations`, resuelta desde este módulo: `src/e2e` y
// `dist/e2e` están a la misma profundidad, así que vale para ambos.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));

export interface E2eSeedTarget {
  readonly ownerUrl: string;
  readonly databaseName: string;
}

// Guards (A3) ANTES de cualquier Pool o Client. Devuelve el destino ya validado.
export function resolveE2eSeedTarget(env: NodeJS.ProcessEnv): E2eSeedTarget {
  const ownerUrl = env.E2E_DATABASE_URL;
  assertE2eOwnerDatabaseUrl(ownerUrl, env.E2E_DEV_DATABASE_NAME, [
    env.DATABASE_URL,
    env.WEB_DATABASE_URL,
  ]);
  assertE2eWebDatabaseUrl(env.E2E_WEB_DATABASE_URL, ownerUrl);
  return {
    ownerUrl,
    databaseName: decodeURIComponent(new URL(ownerUrl).pathname.replace(/^\//, '')),
  };
}

// El nombre ya pasó la expresión `^[a-z0-9_]+_e2e$` del guard, así que es un
// identificador seguro para interpolar (DROP/CREATE DATABASE no admiten parámetros).
async function recreateDatabase(target: E2eSeedTarget): Promise<void> {
  const client = new pg.Client({ connectionString: maintenanceUrl(target.ownerUrl) });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${target.databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${target.databaseName}"`);
  } finally {
    await client.end();
  }
}

// Preflight del rol, concesiones por base y comprobación posterior (S2.1/S2.2).
async function grantReadOnlyAccess(pool: pg.Pool, databaseName: string): Promise<void> {
  const role = await pool.query<{ rolsuper: boolean }>(
    'SELECT rolsuper FROM pg_roles WHERE rolname = $1',
    [WEB_ROLE]
  );
  if (role.rows[0] === undefined) {
    throw new Error(
      `El rol ${WEB_ROLE} no existe en el servidor: el seed e2e no crea roles (spec S2.2).`
    );
  }
  if (role.rows[0].rolsuper) {
    throw new Error(
      `El rol ${WEB_ROLE} es superusuario: el servidor web e2e debe usar un rol de solo lectura.`
    );
  }

  await pool.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${WEB_ROLE}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${WEB_ROLE}`);
  await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${WEB_ROLE}`);
  // Sin JIT: con la caché fría, el JIT de PostgreSQL añade segundos a la primera consulta espacial.
  await pool.query(`ALTER ROLE ${WEB_ROLE} IN DATABASE "${databaseName}" SET jit = off`);

  const check = await pool.query<{ can_select: boolean; can_insert: boolean }>(
    `SELECT has_table_privilege($1, 'listings', 'SELECT') AS can_select,
            has_table_privilege($1, 'listings', 'INSERT') AS can_insert`,
    [WEB_ROLE]
  );
  if (check.rows[0]?.can_select !== true || check.rows[0].can_insert) {
    throw new Error(`Los privilegios de ${WEB_ROLE} no son los esperados (SELECT sí, INSERT no).`);
  }
}

// Todo o nada: un fallo a mitad no deja un dataset parcial.
async function insertFixture(db: Database): Promise<void> {
  const fixture = buildE2eFixture();
  await db.transaction(async (tx) => {
    await tx.insert(sources).values(fixture.sources);
    await tx.insert(locations).values(fixture.location);
    await tx.insert(zones).values(fixture.zone);
    await tx.insert(properties).values(fixture.properties);
    await tx.insert(listings).values(fixture.listings);
    await tx.insert(listingVersions).values(fixture.versions);
    await tx.insert(propertyListings).values(fixture.propertyListings);
  });
}

export async function seedE2eDatabase(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const target = resolveE2eSeedTarget(env);
  await recreateDatabase(target);

  const { db, pool } = createDb(target.ownerUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await grantReadOnlyAccess(pool, target.databaseName);
    await insertFixture(db);
  } finally {
    await pool.end();
  }
}

// Solo como entrypoint (`pnpm --filter @buscahogar/db seed:e2e`), nunca al importarlo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedE2eDatabase().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

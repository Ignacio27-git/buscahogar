// Aislamiento de las suites con base de datos (decisión 245, cierra la 046): ninguna
// suite toca la base de desarrollo. La base de pruebas se DERIVA de `DATABASE_URL`
// (`<dev>_db_test`, `<dev>_web_test`, `<dev>_ingestion_test`), la crea y migra
// la propia ejecución de tests (Vitest `globalSetup`) y el `setupFiles` de cada
// paquete reescribe en el proceso las variables de conexión hacia ella.
//
// Punto de entrada de solo-test (`@buscahogar/db/test-database`), NO se exporta
// desde `index.ts`. Como el resto del paquete, nunca lee `process.env` (decisión
// 024): el entorno llega siempre como parámetro.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import type { Pool } from 'pg';

import { createDb } from './db.js';
import { maintenanceUrl } from './e2e/guard.js';
import { runMigrations } from './migrate.js';

export type TestDatabaseScope = 'db' | 'web' | 'ingestion';

export class TestDatabaseGuardError extends Error {}

// Identificador seguro: se interpola entre comillas en `CREATE DATABASE`, que no
// admite parámetros.
const SAFE_TEST_DATABASE_NAME = /^[a-z0-9_]+_test$/;

// `src` y `dist` están a la misma profundidad, así que ambas rutas valen para los dos.
const GRANTS_SQL_PATH = fileURLToPath(new URL('../sql/bootstrap-roles-grants.sql', import.meta.url));

// SQLSTATE de «la base ya existe» (`CREATE DATABASE`) y de la carrera entre dos
// procesos que la crean a la vez (`unique_violation` sobre `pg_database`).
const DUPLICATE_DATABASE = '42P04';
const UNIQUE_VIOLATION = '23505';

function databaseNameOf(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

// Deriva la URL de la base de pruebas del paquete. Los mensajes nunca incluyen la
// URL (lleva la contraseña) y nombran siempre la salida ejecutable.
export function testDatabaseUrl(devUrl: string | undefined, scope: TestDatabaseScope): string {
  if (devUrl === undefined || devUrl === '') {
    throw new TestDatabaseGuardError(
      'DATABASE_URL no está definida: las suites con base de datos la necesitan para derivar su base ' +
        '_test. Defínela en .env (ver .env.example) y levanta la base con `docker compose up -d db`.'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(devUrl);
  } catch {
    throw new TestDatabaseGuardError('DATABASE_URL no es una URL de conexión legible.');
  }

  const devName = databaseNameOf(parsed);
  if (!/^[a-z0-9_]+$/.test(devName)) {
    throw new TestDatabaseGuardError(
      'El nombre de la base de DATABASE_URL no es un identificador seguro (minúsculas, dígitos y guion bajo).'
    );
  }

  // Una base de desarrollo que ya termina en el sufijo del paquete no se vuelve a
  // sufijar: la derivada sería ella misma y la comprobación siguiente la rechaza.
  const suffix = `_${scope}_test`;
  const derivedName = devName.endsWith(suffix) ? devName : `${devName}${suffix}`;
  if (!SAFE_TEST_DATABASE_NAME.test(derivedName)) {
    throw new TestDatabaseGuardError(
      `El nombre de la base de pruebas derivada ("${derivedName}") no es un nombre _test seguro.`
    );
  }
  if (derivedName === devName) {
    throw new TestDatabaseGuardError(
      `La base de pruebas derivada ("${derivedName}") coincide con la base de DATABASE_URL: ` +
        'DATABASE_URL debe apuntar a la base de desarrollo, nunca a una base _test.'
    );
  }

  parsed.pathname = `/${derivedName}`;
  return parsed.toString();
}

// Reescribe en `env` las claves indicadas (solo las presentes) hacia la base de
// pruebas del paquete. Idempotente: una URL que ya apunta a `*_<scope>_test` se
// deja como está, porque un worker reutilizado volvería a ejecutar el setup.
export function redirectToTestDatabase(
  env: Record<string, string | undefined>,
  scope: TestDatabaseScope,
  keys: readonly string[]
): void {
  for (const key of keys) {
    const value = env[key];
    if (value === undefined || value === '') {
      continue;
    }
    let alreadyRedirected = false;
    try {
      alreadyRedirected = databaseNameOf(new URL(value)).endsWith(`_${scope}_test`);
    } catch {
      // URL ilegible: `testDatabaseUrl` lo rechaza con su mensaje sin credenciales.
    }
    if (!alreadyRedirected) {
      env[key] = testDatabaseUrl(value, scope);
    }
  }
}

// Crea (si falta), migra y, para web, concede los privilegios de los roles acotados
// sobre la base de pruebas. Idempotente y segura ante ejecuciones concurrentes.
export async function prepareTestDatabase(
  ownerTestUrl: string,
  options: { readonly grantWebRoles: boolean }
): Promise<void> {
  const name = databaseNameOf(new URL(ownerTestUrl));
  if (!SAFE_TEST_DATABASE_NAME.test(name)) {
    throw new TestDatabaseGuardError(
      `Se rechaza aprovisionar "${name}": solo se crean bases con nombre _test seguro.`
    );
  }

  const maintenance = new pg.Client({ connectionString: maintenanceUrl(ownerTestUrl) });
  try {
    await maintenance.connect();
  } catch {
    throw new TestDatabaseGuardError(
      'No se puede conectar con la base de datos para preparar la base _test. ' +
        'Levántala con `docker compose up -d db` y reintenta.'
    );
  }
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== DUPLICATE_DATABASE && code !== UNIQUE_VIOLATION) {
      throw error;
    }
  } finally {
    await maintenance.end();
  }

  const { db, pool } = createDb(ownerTestUrl);
  try {
    await runMigrations(db);
    if (options.grantWebRoles) {
      // Misma definición única de privilegios que el bootstrap de desarrollo.
      await pool.query(readFileSync(GRANTS_SQL_PATH, 'utf8'));
    }
  } finally {
    await pool.end();
  }
}

// Última barrera antes de cualquier TRUNCATE: la conexión REAL debe ser a una base _test.
export async function assertConnectedToTestDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{ name: string }>('SELECT current_database() AS name');
  const name = result.rows[0]?.name ?? '';
  if (!SAFE_TEST_DATABASE_NAME.test(name)) {
    throw new TestDatabaseGuardError(
      `Se rechaza vaciar tablas en "${name}": la conexión de pruebas debe ser a una base _test.`
    );
  }
}

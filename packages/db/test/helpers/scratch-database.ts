// Bases de datos desechables para las pruebas del despliegue (ROADMAP 3.4, decisión 257). El
// despliegue crea esquema, roles y privilegios desde cero, así que cada prueba necesita una base
// VACÍA que no sea la `_db_test` compartida por el resto de suites. El nombre se deriva de la base
// de pruebas ya redirigida (`<dev>_db_test` → `<dev>_deploy_<sufijo>_test`) y pasa el mismo guardián
// de nombre `_test` que el resto de bases de prueba (decisión 245).
import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { maintenanceUrl } from '../../src/e2e/guard.js';

const SAFE_NAME = /^[a-z0-9_]+_test$/;

export interface ScratchDatabase {
  readonly name: string;
  // URL del propietario (la del `DATABASE_URL` de pruebas) apuntando a la base desechable.
  readonly url: string;
  drop(): Promise<void>;
}

function withDatabase(ownerUrl: string, name: string): string {
  const parsed = new URL(ownerUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export async function createScratchDatabase(testDatabaseUrl: string, label: string): Promise<ScratchDatabase> {
  const baseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ''));
  const stem = baseName.replace(/_db_test$/, '');
  const name = `${stem}_deploy_${label}_${randomBytes(3).toString('hex')}_test`;
  if (!SAFE_NAME.test(name) || name === baseName) {
    throw new Error(`Nombre de base desechable no seguro: "${name}".`);
  }

  const maintenance = new pg.Client({ connectionString: maintenanceUrl(testDatabaseUrl) });
  await maintenance.connect();
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
  } finally {
    await maintenance.end();
  }

  return {
    name,
    url: withDatabase(testDatabaseUrl, name),
    async drop(): Promise<void> {
      const client = new pg.Client({ connectionString: maintenanceUrl(testDatabaseUrl) });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}

// Quita roles de prueba tras soltar la base desechable (los roles son del servidor, no de la base).
export async function dropRoles(testDatabaseUrl: string, roles: readonly string[]): Promise<void> {
  const client = new pg.Client({ connectionString: maintenanceUrl(testDatabaseUrl) });
  await client.connect();
  try {
    for (const role of roles) {
      if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
        throw new Error('Nombre de rol de prueba no seguro.');
      }
      await client.query(`DROP ROLE IF EXISTS "${role}"`);
    }
  } finally {
    await client.end();
  }
}

// URL de conexión como otro rol sobre la misma base (para comprobar inicios de sesión reales).
export function urlAsRole(ownerUrl: string, role: string, password: string): string {
  const parsed = new URL(ownerUrl);
  parsed.username = role;
  parsed.password = password;
  return parsed.toString();
}

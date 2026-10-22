// ROADMAP 3.4 (decisión 264 enmienda la 101; decisión 257; D11, PD10; R2.4, R5.5) — comprobaciones
// POSTERIORES al despliegue. Un fallo aquí significa «el entorno no quedó como se documenta» y el despliegue
// termina con el código 4, nunca con un aviso silencioso.
//   1. JIT apagado para `web_readonly` (`SHOW jit` = off, visto con las credenciales reales de ese rol).
//      Preferente a nivel de rol (el bootstrap lo fija); si el proveedor gestionado no lo permite, se aplica
//      `ALTER DATABASE ... SET jit = off` (afecta a TODA la base, ingesta incluida) y se vuelve a comprobar.
//   2. Matriz de privilegios final de los dos roles web.
// Este módulo no lee `process.env` (decisión 024).
import pg from 'pg';

import type { DeployLogger } from './deploy-log.js';
import { DEFAULT_ROLE_NAMES } from './privilege-fingerprint.js';
import type { RoleNames } from './privilege-fingerprint.js';

// Comprobación posterior fallida: `check` la nombra (`jit`, `privileges`, `role-login`...).
export class DeployCheckError extends Error {
  constructor(
    readonly check: string,
    message: string
  ) {
    super(message);
    this.name = 'DeployCheckError';
  }
}

export type JitStrategy = 'role' | 'database' | 'server';

const LOGIN_TIMEOUT_MS = 5000;

async function showJit(url: string): Promise<string> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: LOGIN_TIMEOUT_MS });
  try {
    await client.connect();
    const { rows } = await client.query<{ jit: string }>('show jit');
    return rows[0]?.jit ?? '';
  } finally {
    await client.end().catch(() => undefined);
  }
}

// ¿De dónde viene el `off` que ve el rol? Del ajuste del rol en esta base, del de la base, o del servidor.
async function jitSource(db: Pick<pg.Pool, 'query'>, roleName: string): Promise<JitStrategy> {
  const { rows } = await db.query<{ role_level: boolean; database_level: boolean }>(
    `select
       exists (
         select 1 from pg_db_role_setting s
         join pg_roles r on r.oid = s.setrole and r.rolname = $1
         join pg_database d on d.oid = s.setdatabase and d.datname = current_database()
         where 'jit=off' = any (s.setconfig)
       ) as role_level,
       exists (
         select 1 from pg_db_role_setting s
         join pg_database d on d.oid = s.setdatabase and d.datname = current_database()
         where s.setrole = 0 and 'jit=off' = any (s.setconfig)
       ) as database_level`,
    [roleName]
  );
  if (rows[0]?.role_level === true) {
    return 'role';
  }
  return rows[0]?.database_level === true ? 'database' : 'server';
}

export async function ensureJitOff(
  owner: Pick<pg.Pool, 'query'>,
  readonlyUrl: string,
  readonlyRole: string,
  log: DeployLogger
): Promise<JitStrategy> {
  if ((await showJit(readonlyUrl)) === 'off') {
    const strategy = await jitSource(owner, readonlyRole);
    log({ level: 'info', step: 'verify', msg: 'jit off', strategy });
    return strategy;
  }

  log({
    level: 'warn',
    step: 'verify',
    msg: 'jit is not off at role level: applying the database-level fallback (decision 264)',
  });
  // `format('%I', ...)` cita el nombre de la base en el propio servidor.
  const { rows } = await owner.query<{ statement: string }>(
    `select format('ALTER DATABASE %I SET jit = off', current_database()) as statement`
  );
  const statement = rows[0]?.statement;
  if (statement === undefined) {
    throw new DeployCheckError('jit', 'No se pudo construir la sentencia ALTER DATABASE del respaldo de jit.');
  }
  await owner.query(statement);

  const after = await showJit(readonlyUrl);
  if (after !== 'off') {
    throw new DeployCheckError(
      'jit',
      `SHOW jit sigue en "${after}" para ${readonlyRole} tras el respaldo a nivel de base de datos ` +
        '(¿un ajuste de rol lo anula?). El despliegue no puede garantizar jit = off.'
    );
  }
  log({ level: 'info', step: 'verify', msg: 'jit off', strategy: 'database' });
  return 'database';
}

// Tablas SOLO del propietario: ningún rol web las toca (decisiones 248 y 255). Cada tabla nueva del
// propietario se añade aquí y su REVOKE al bloque final del bootstrap (los privilegios por defecto le
// darían SELECT a `web_readonly`).
export const OWNER_ONLY_TABLES: readonly string[] = ['monthly_request_budget', 'proxy_rate_limit'];

// Privilegios EXACTOS de `web_coverage` (decisiones 064, 076, 102 y 255); todo lo demás, denegado.
const COVERAGE_GRANTS: Readonly<Record<string, readonly string[]>> = {
  coverage_jobs: ['INSERT'],
  coverage_client_quota: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  zone_query_signals: ['INSERT'],
  proxy_rate_limit: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
};

// Tablas de extensiones (PostGIS): su dueño es la extensión y PUBLIC ya puede leerlas; no son datos de
// la aplicación ni se gestionan desde el bootstrap.
const EXTENSION_TABLES: readonly string[] = ['spatial_ref_sys'];

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

async function effectivePrivileges(db: Pick<pg.Pool, 'query'>, role: string): Promise<Map<string, Set<string>>> {
  const { rows } = await db.query<{ tbl: string; privilege: string; allowed: boolean }>(
    `select c.relname as tbl, p as privilege, has_table_privilege($1, c.oid, p) as allowed
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     cross join unnest($2::text[]) as p
     where c.relkind in ('r', 'p') and c.relname <> all ($3::text[])
     order by 1, 2`,
    [role, [...TABLE_PRIVILEGES], [...EXTENSION_TABLES]]
  );
  const byTable = new Map<string, Set<string>>();
  for (const row of rows) {
    const granted = byTable.get(row.tbl) ?? new Set<string>();
    if (row.allowed) {
      granted.add(row.privilege);
    }
    byTable.set(row.tbl, granted);
  }
  return byTable;
}

function diff(role: string, actual: Map<string, Set<string>>, expected: (table: string) => ReadonlySet<string>): string[] {
  const failures: string[] = [];
  for (const [table, granted] of actual) {
    const wanted = expected(table);
    for (const privilege of TABLE_PRIVILEGES) {
      if (granted.has(privilege) && !wanted.has(privilege)) {
        failures.push(`${role} must not have ${privilege} on ${table}`);
      } else if (!granted.has(privilege) && wanted.has(privilege)) {
        failures.push(`${role} must have ${privilege} on ${table}`);
      }
    }
  }
  return failures;
}

// Compara los privilegios EFECTIVOS (propios, de PUBLIC y heredados: `has_table_privilege`) con la matriz
// documentada. Devuelve un mensaje por cada desajuste; vacío = coincide.
export async function checkPrivilegeMatrix(
  db: Pick<pg.Pool, 'query'>,
  names: RoleNames = DEFAULT_ROLE_NAMES
): Promise<readonly string[]> {
  const readonly = diff(names.readonly, await effectivePrivileges(db, names.readonly), (table) =>
    OWNER_ONLY_TABLES.includes(table) ? new Set<string>() : new Set(['SELECT'])
  );
  const coverage = diff(
    names.coverage,
    await effectivePrivileges(db, names.coverage),
    (table) => new Set(COVERAGE_GRANTS[table] ?? [])
  );
  return [...readonly, ...coverage];
}

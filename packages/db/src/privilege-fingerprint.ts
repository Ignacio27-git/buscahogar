// ROADMAP 3.4 (decisión 257, D10; R5.2, R5.5) — paso de privilegios del despliegue. Aplica el bootstrap
// (`sql/bootstrap-roles-grants.sql`: todos los GRANT y los privilegios por defecto primero, el bloque
// REVOKE al final, decisiones 064, 248 y 255) y compara una HUELLA de los privilegios antes y después, para
// que la segunda ejecución pueda informar «privileges unchanged». La huella cubre las ACL de las tablas
// de `public`, los privilegios por defecto, y los privilegios de la base de datos y del esquema `public`.
// Este módulo no lee `process.env` (decisión 024).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

export interface RoleNames {
  readonly readonly: string;
  readonly coverage: string;
}

// Nombres canónicos de los roles de `apps/web` (decisiones 056 y 064).
export const DEFAULT_ROLE_NAMES: RoleNames = { readonly: 'web_readonly', coverage: 'web_coverage' };

// `src` y `dist` están a la misma profundidad; el paquete publica `sql` en `files`.
const BOOTSTRAP_SQL_PATH = fileURLToPath(new URL('../sql/bootstrap-roles-grants.sql', import.meta.url));

const SAFE_ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

function assertIdentifier(name: string): void {
  if (!SAFE_ROLE_NAME.test(name)) {
    throw new Error('El nombre del rol debe ser un identificador simple en minúsculas.');
  }
}

// El bootstrap está escrito con los nombres canónicos. Se sustituyen solo como palabra completa para poder
// desplegar con otros nombres (dos entornos en un mismo servidor, donde los roles son globales, o pruebas
// que no deben tocar los roles reales). Con los nombres por defecto devuelve el fichero tal cual.
export function bootstrapGrantsSql(names: RoleNames = DEFAULT_ROLE_NAMES): string {
  assertIdentifier(names.readonly);
  assertIdentifier(names.coverage);
  const source = readFileSync(BOOTSTRAP_SQL_PATH, 'utf8');
  return source
    .replace(/\bweb_readonly\b/g, names.readonly)
    .replace(/\bweb_coverage\b/g, names.coverage);
}

// Una línea por privilegio concedido, ordenada, y el SHA-256 del conjunto. Las ACL se leen del catálogo con
// `aclexplode`, no de texto: el orden interno del array `aclitem[]` no afecta a la huella.
const FINGERPRINT_SQL = `
  select line from (
    select 'table:' || c.relname || ':' || a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.is_grantable as line
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join lateral aclexplode(c.relacl) a
    where c.relacl is not null
    union all
    select 'default:' || d.defaclrole::regrole::text || ':' || coalesce(d.defaclnamespace::regnamespace::text, '-') || ':' ||
           d.defaclobjtype::text || ':' || a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.is_grantable
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    union all
    select 'database:' || a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.is_grantable
    from pg_database db
    cross join lateral aclexplode(db.datacl) a
    where db.datname = current_database()
    union all
    select 'schema:' || a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.is_grantable
    from pg_namespace s
    cross join lateral aclexplode(s.nspacl) a
    where s.nspname = 'public'
  ) privileges
  order by line
`;

export async function privilegeFingerprint(db: Pick<pg.Pool, 'query'>): Promise<string> {
  const { rows } = await db.query<{ line: string }>(FINGERPRINT_SQL);
  return createHash('sha256')
    .update(rows.map((row) => row.line).join('\n'))
    .digest('hex');
}

export interface GrantsResult {
  // `false` si la huella de privilegios es idéntica antes y después de aplicar el bootstrap.
  readonly changed: boolean;
}

// El fichero se envía como UNA consulta multi-sentencia (protocolo simple): PostgreSQL la ejecuta en una
// transacción implícita, así que ningún observador ve a `web_readonly` con un SELECT transitorio sobre las
// tablas del bloque REVOKE final.
export async function applyBootstrapGrants(
  db: Pick<pg.Pool, 'query'>,
  names: RoleNames = DEFAULT_ROLE_NAMES
): Promise<GrantsResult> {
  const before = await privilegeFingerprint(db);
  await db.query(bootstrapGrantsSql(names));
  const after = await privilegeFingerprint(db);
  return { changed: before !== after };
}

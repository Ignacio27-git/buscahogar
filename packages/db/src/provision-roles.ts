// ROADMAP 3.4 (decisión 257, D10; R5.2-R5.4) — aprovisionamiento IDEMPOTENTE de los roles de superficie
// acotada de `apps/web`. Por cada rol:
//   - no existe → `CREATE ROLE ... LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION` con el
//     verificador SCRAM calculado en Node (`scram.ts`) → `created`;
//   - existe → se comprueba PRIMERO el inicio de sesión con el secreto actual: si entra, no se reescribe
//     nada (`unchanged`: la segunda ejecución del despliegue no cambia el verificador); si el servidor
//     responde 28P01 (el secreto cambió) → `ALTER ROLE ... PASSWORD <verificador>` → `rotated`.
//   - tras crear o rotar se comprueba otra vez el inicio de sesión: si falla, error ruidoso (exit 4 en el
//     despliegue) y SIN respaldo automático con la contraseña en claro.
// La contraseña en claro nunca viaja en SQL ni en registros; el verificador sí aparece en la sentencia
// (es lo que PostgreSQL guarda), así que los mensajes de error de este módulo no incluyen sentencias.
// Los atributos del rol (sin superusuario, sin CREATEDB/CREATEROLE/REPLICATION) se exigen siempre.
// Este módulo no lee `process.env` (decisión 024).
import pg from 'pg';

import { silentLogger } from './deploy-log.js';
import type { DeployLogger } from './deploy-log.js';
import { scramSha256Verifier } from './scram.js';

export type RoleOutcome = 'created' | 'rotated' | 'unchanged';

export interface RoleSpec {
  readonly name: string;
  readonly password: string;
}

// Secreto ausente o nombre no válido: configuración, antes de tocar ningún privilegio (exit 2).
export class RoleConfigError extends Error {}

// El rol no quedó como se esperaba tras aprovisionarlo (exit 4).
export class RoleProvisionError extends Error {}

export interface ProvisionDeps {
  readonly canLogin?: (url: string) => Promise<boolean>;
  readonly log?: DeployLogger;
}

type Queryable = Pick<pg.Pool, 'query'>;

// Identificador simple y en minúsculas: se interpola entre comillas en DDL, que no admite parámetros.
const SAFE_ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
// Forma de un verificador SCRAM-SHA-256: solo base64 y separadores, nada que exija escape en un literal.
const VERIFIER_SHAPE = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

const INVALID_PASSWORD = '28P01';
const DUPLICATE_OBJECT = '42710';
const LOGIN_TIMEOUT_MS = 5000;

function assertRoleName(name: string): void {
  if (!SAFE_ROLE_NAME.test(name)) {
    throw new RoleConfigError('El nombre del rol debe ser un identificador simple en minúsculas.');
  }
}

function verifierLiteral(password: string): string {
  const verifier = scramSha256Verifier(password);
  if (!VERIFIER_SHAPE.test(verifier)) {
    throw new RoleProvisionError('El verificador SCRAM calculado no tiene la forma esperada.');
  }
  return `'${verifier}'`;
}

// URL de conexión como `name` sobre la misma base y servidor que `ownerUrl`.
export function roleLoginUrl(ownerUrl: string, name: string, password: string): string {
  const parsed = new URL(ownerUrl);
  parsed.username = name;
  parsed.password = password;
  return parsed.toString();
}

// `true` si el servidor acepta las credenciales; `false` SOLO ante 28P01 (contraseña inválida, que
// PostgreSQL también devuelve para un rol inexistente). Cualquier otro error se propaga.
export async function canLogin(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: LOGIN_TIMEOUT_MS });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === INVALID_PASSWORD) {
      return false;
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function roleExists(db: Queryable, name: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from pg_roles where rolname = $1', [name]);
  return rows.length > 0;
}

async function assertSafeAttributes(db: Queryable, name: string): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication as ok
     from pg_roles where rolname = $1`,
    [name]
  );
  if (rows[0]?.ok !== true) {
    throw new RoleProvisionError(
      `El rol "${name}" tiene atributos no permitidos (debe ser LOGIN, sin superusuario, CREATEDB, CREATEROLE ni REPLICATION).`
    );
  }
}

async function assertLoginWorks(
  check: (url: string) => Promise<boolean>,
  ownerUrl: string,
  spec: RoleSpec
): Promise<void> {
  if (!(await check(roleLoginUrl(ownerUrl, spec.name, spec.password)))) {
    throw new RoleProvisionError(
      `El rol "${spec.name}" no puede iniciar sesión con su secreto tras aprovisionarlo ` +
        '(¿el servidor no acepta el verificador SCRAM precalculado?). No se usa ningún respaldo con la contraseña en claro.'
    );
  }
}

export async function provisionRole(
  db: Queryable,
  ownerUrl: string,
  spec: RoleSpec,
  deps: ProvisionDeps = {}
): Promise<RoleOutcome> {
  assertRoleName(spec.name);
  const check = deps.canLogin ?? canLogin;
  const log = deps.log ?? silentLogger;
  const quoted = `"${spec.name}"`;

  const loginWorks = (): Promise<boolean> => check(roleLoginUrl(ownerUrl, spec.name, spec.password));

  let outcome: RoleOutcome;
  if (await roleExists(db, spec.name)) {
    outcome = (await loginWorks()) ? 'unchanged' : 'rotated';
  } else {
    outcome = 'created';
    try {
      await db.query(
        `CREATE ROLE ${quoted} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${verifierLiteral(spec.password)}`
      );
    } catch (error) {
      // Carrera con otro despliegue que lo creó entre la comprobación y la sentencia: se trata como existente.
      if ((error as { code?: string }).code !== DUPLICATE_OBJECT) {
        throw error;
      }
      outcome = (await loginWorks()) ? 'unchanged' : 'rotated';
    }
  }
  if (outcome === 'rotated') {
    await db.query(`ALTER ROLE ${quoted} PASSWORD ${verifierLiteral(spec.password)}`);
  }
  if (outcome !== 'unchanged') {
    await assertLoginWorks(check, ownerUrl, spec);
  }

  await assertSafeAttributes(db, spec.name);
  log({ level: 'info', step: 'roles', msg: `role ${outcome}`, role: spec.name });
  return outcome;
}

// Valida TODOS los secretos y nombres antes de tocar ningún rol (R5.4): un secreto ausente no deja a
// medias el aprovisionamiento. Devuelve el resultado por rol.
export async function provisionRoles(
  db: Queryable,
  ownerUrl: string,
  specs: readonly RoleSpec[],
  deps: ProvisionDeps = {}
): Promise<Readonly<Record<string, RoleOutcome>>> {
  for (const spec of specs) {
    assertRoleName(spec.name);
    if (spec.password.trim() === '') {
      throw new RoleConfigError(`Falta el secreto del rol "${spec.name}" (vacío o en blanco).`);
    }
  }
  const outcomes: Record<string, RoleOutcome> = {};
  for (const spec of specs) {
    outcomes[spec.name] = await provisionRole(db, ownerUrl, spec, deps);
  }
  return outcomes;
}

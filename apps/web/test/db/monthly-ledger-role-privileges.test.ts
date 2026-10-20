// ROADMAP 3.3 (decisión 248; NF2, diseño D8b) — prueba NEGATIVA de privilegios sobre
// el registro mensual de cuota. Los privilegios por defecto del bootstrap
// (`ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO web_readonly`) y el
// `GRANT SELECT ON ALL TABLES` exponen cualquier tabla nueva a `web_readonly`, así que
// la migración 0019 y el bootstrap hacen un REVOKE explícito: `apps/web` no lee ni
// escribe `monthly_request_budget` con ninguno de sus dos roles y no gana ningún GRANT.
//
// Se comprueba con `has_table_privilege` (el catálogo, sin depender de qué conexión se
// abra) y, además, con una conexión REAL del rol de solo lectura. Gateada en ambas
// variables de rol: sin los roles provisionados la suite se OMITE, nunca falla (mismo
// criterio que `coverage-role-privileges.test.ts`). El propietario (`DATABASE_URL`) es
// quien siembra y quien re-ejecuta el bootstrap, igual que `prepareTestDatabase`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '@buscahogar/db';

import { connectTestDb } from '../helpers/db-client.js';

const BOOTSTRAP_SQL_PATH = fileURLToPath(new URL('../../../../packages/db/sql/bootstrap-roles-grants.sql', import.meta.url));

const WEB_ROLES = ['web_readonly', 'web_coverage'] as const;
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

const rolesProvisioned = Boolean(process.env.WEB_DATABASE_URL) && Boolean(process.env.WEB_COVERAGE_DATABASE_URL);

type Pool = ReturnType<typeof connectTestDb>['pool'];

async function hasPrivilege(pool: Pool, role: string, table: string, privilege: string): Promise<boolean> {
  const { rows } = await pool.query<{ allowed: boolean }>('select has_table_privilege($1, $2, $3) as allowed', [
    role,
    table,
    privilege,
  ]);
  return rows[0]?.allowed === true;
}

describe.skipIf(!rolesProvisioned)('roles de apps/web sobre monthly_request_budget — NF2, decisión 248', () => {
  let ownerPool: Pool;
  let readonlyPool: Pool;

  beforeAll(() => {
    ({ pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- skipIf ya garantiza que la variable existe
    ({ pool: readonlyPool } = createDb(process.env.WEB_DATABASE_URL!));
  });

  afterAll(async () => {
    await ownerPool.end();
    await readonlyPool.end();
  });

  it('control (la prueba no es vacía): el bootstrap SÍ concedió lo suyo — SELECT sobre zone_query_signals a web_readonly e INSERT sobre coverage_jobs a web_coverage', async () => {
    expect(await hasPrivilege(ownerPool, 'web_readonly', 'zone_query_signals', 'SELECT')).toBe(true);
    expect(await hasPrivilege(ownerPool, 'web_coverage', 'coverage_jobs', 'INSERT')).toBe(true);
  });

  it.each(WEB_ROLES.flatMap((role) => PRIVILEGES.map((privilege) => [role, privilege] as const)))(
    '%s NO tiene %s sobre monthly_request_budget',
    async (role, privilege) => {
      expect(await hasPrivilege(ownerPool, role, 'monthly_request_budget', privilege)).toBe(false);
    }
  );

  it('tras RE-EJECUTAR bootstrap-roles-grants.sql sigue sin haber ningún privilegio (el REVOKE va después de GRANT ON ALL TABLES y de los privilegios por defecto)', async () => {
    await ownerPool.query(readFileSync(BOOTSTRAP_SQL_PATH, 'utf8'));

    for (const role of WEB_ROLES) {
      for (const privilege of PRIVILEGES) {
        expect(await hasPrivilege(ownerPool, role, 'monthly_request_budget', privilege)).toBe(false);
      }
    }
    // Y el bootstrap sigue concediendo el resto: el REVOKE no se llevó nada más por delante.
    expect(await hasPrivilege(ownerPool, 'web_readonly', 'zone_query_signals', 'SELECT')).toBe(true);
    expect(await hasPrivilege(ownerPool, 'web_coverage', 'coverage_jobs', 'INSERT')).toBe(true);
  });

  it('una conexión REAL de web_readonly recibe permission denied (42501) al leer el registro mensual', async () => {
    await expect(readonlyPool.query('select * from monthly_request_budget limit 1')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('el propietario (credencial de apps/ingestion) SÍ lee zone_query_signals y monthly_request_budget (R16)', async () => {
    const { rows } = await ownerPool.query<{ allowed: boolean }>(
      "select has_table_privilege(current_user, 'zone_query_signals', 'SELECT') as allowed"
    );
    expect(rows[0]?.allowed).toBe(true);
    await expect(ownerPool.query('select count(*) from zone_query_signals')).resolves.toBeDefined();
    await expect(ownerPool.query('select count(*) from monthly_request_budget')).resolves.toBeDefined();
  });
});

// ROADMAP 3.4 (decisión 255, D5b; R1.5, R5.5) — privilegios de los dos roles web sobre `proxy_rate_limit`.
// `web_coverage` recibe EXACTAMENTE SELECT/INSERT/UPDATE/DELETE (la sentencia atómica del limitador las
// necesita); `web_readonly` no recibe ninguno, aunque los privilegios por defecto del bootstrap le
// concedan SELECT sobre cualquier tabla nueva: de ahí el REVOKE explícito de la migración 0020 y del
// bloque final del bootstrap (patrón de la decisión 064 / 248).
//
// Se comprueba con el catálogo (`has_table_privilege`, `aclexplode`) y con conexiones REALES de ambos
// roles. Gateada en las dos variables de rol: sin los roles aprovisionados se OMITE, nunca falla. El
// propietario (`DATABASE_URL`) re-ejecuta el bootstrap, igual que `prepareTestDatabase`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '@buscahogar/db';

import { connectTestDb } from '../helpers/db-client.js';

const BOOTSTRAP_SQL_PATH = fileURLToPath(new URL('../../../../packages/db/sql/bootstrap-roles-grants.sql', import.meta.url));

const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
const OTHER_PRIVILEGES = ['TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

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

// Matriz completa de lo que `web_coverage` tiene hoy sobre las tablas de `public` (excluye al propietario).
async function coverageGrants(pool: Pool): Promise<readonly string[]> {
  const { rows } = await pool.query<{ grant: string }>(
    `select c.relname || ':' || a.privilege_type as grant
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     cross join lateral aclexplode(c.relacl) a
     join pg_roles r on r.oid = a.grantee and r.rolname = 'web_coverage'
     where c.relkind = 'r'
     order by 1`
  );
  return rows.map((row) => row.grant);
}

describe.skipIf(!rolesProvisioned)('roles de apps/web sobre proxy_rate_limit — decisión 255, D5b', () => {
  let ownerPool: Pool;
  let readonlyPool: Pool;
  let coveragePool: Pool;

  beforeAll(() => {
    ({ pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- skipIf ya garantiza que la variable existe
    ({ pool: readonlyPool } = createDb(process.env.WEB_DATABASE_URL!));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- skipIf ya garantiza que la variable existe
    ({ pool: coveragePool } = createDb(process.env.WEB_COVERAGE_DATABASE_URL!));
  });

  afterAll(async () => {
    await ownerPool.end();
    await readonlyPool.end();
    await coveragePool.end();
  });

  async function expectFinalPrivileges(): Promise<void> {
    for (const privilege of PRIVILEGES) {
      expect(await hasPrivilege(ownerPool, 'web_coverage', 'proxy_rate_limit', privilege)).toBe(true);
      expect(await hasPrivilege(ownerPool, 'web_readonly', 'proxy_rate_limit', privilege)).toBe(false);
    }
    for (const privilege of OTHER_PRIVILEGES) {
      expect(await hasPrivilege(ownerPool, 'web_coverage', 'proxy_rate_limit', privilege)).toBe(false);
      expect(await hasPrivilege(ownerPool, 'web_readonly', 'proxy_rate_limit', privilege)).toBe(false);
    }
  }

  it('control (la prueba no es vacía): web_readonly SÍ lee una tabla de lectura normal', async () => {
    expect(await hasPrivilege(ownerPool, 'web_readonly', 'zone_query_signals', 'SELECT')).toBe(true);
  });

  it('web_coverage tiene exactamente SELECT/INSERT/UPDATE/DELETE y web_readonly ningún privilegio', async () => {
    await expectFinalPrivileges();
  });

  it('web_coverage no gana ningún otro GRANT: la matriz completa es la documentada', async () => {
    expect(await coverageGrants(ownerPool)).toEqual([
      'coverage_client_quota:DELETE',
      'coverage_client_quota:INSERT',
      'coverage_client_quota:SELECT',
      'coverage_client_quota:UPDATE',
      'coverage_jobs:INSERT',
      'proxy_rate_limit:DELETE',
      'proxy_rate_limit:INSERT',
      'proxy_rate_limit:SELECT',
      'proxy_rate_limit:UPDATE',
      'zone_query_signals:INSERT',
    ]);
  });

  it('tras RE-EJECUTAR bootstrap-roles-grants.sql el resultado es el mismo (idempotente)', async () => {
    await ownerPool.query(readFileSync(BOOTSTRAP_SQL_PATH, 'utf8'));

    await expectFinalPrivileges();
    expect(await hasPrivilege(ownerPool, 'web_coverage', 'coverage_jobs', 'INSERT')).toBe(true);
  });

  it('el REVOKE sobrevive a la recreación de la tabla: los privilegios por defecto la exponen y el bootstrap la vuelve a cerrar', async () => {
    const client = await ownerPool.connect();
    try {
      // DDL transaccional: se recrea la tabla dentro de una transacción y se deshace al final.
      await client.query('begin');
      await client.query('drop table proxy_rate_limit');
      await client.query(
        `create table proxy_rate_limit (
           key_hash text primary key, window_start_ms bigint not null, hits integer not null check (hits >= 1))`
      );
      const exposed = await client.query<{ allowed: boolean }>(
        "select has_table_privilege('web_readonly', 'proxy_rate_limit', 'SELECT') as allowed"
      );
      // Control: sin el bloque final del bootstrap, los privilegios por defecto SÍ exponen la tabla.
      expect(exposed.rows[0]?.allowed).toBe(true);

      await client.query(readFileSync(BOOTSTRAP_SQL_PATH, 'utf8'));

      const closed = await client.query<{ readonly_select: boolean; coverage_update: boolean }>(
        `select has_table_privilege('web_readonly', 'proxy_rate_limit', 'SELECT') as readonly_select,
                has_table_privilege('web_coverage', 'proxy_rate_limit', 'UPDATE') as coverage_update`
      );
      expect(closed.rows[0]).toEqual({ readonly_select: false, coverage_update: true });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('conexión REAL de web_readonly: permission denied (42501) al leer y al escribir el limitador', async () => {
    await expect(readonlyPool.query('select * from proxy_rate_limit limit 1')).rejects.toMatchObject({ code: '42501' });
    await expect(
      readonlyPool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('x', 0, 1)")
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('conexión REAL de web_coverage: SELECT/INSERT/UPDATE/DELETE funcionan sobre el limitador y TRUNCATE no', async () => {
    await coveragePool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('priv-test', 0, 1)");
    await coveragePool.query("update proxy_rate_limit set hits = 2 where key_hash = 'priv-test'");
    const { rows } = await coveragePool.query<{ hits: number }>(
      "select hits from proxy_rate_limit where key_hash = 'priv-test'"
    );
    expect(rows).toEqual([{ hits: 2 }]);
    await coveragePool.query("delete from proxy_rate_limit where key_hash = 'priv-test'");
    await expect(coveragePool.query('truncate proxy_rate_limit')).rejects.toMatchObject({ code: '42501' });
  });

  it('web_coverage sigue sin poder leer coverage_jobs ni el registro mensual (sin privilegios extra)', async () => {
    await expect(coveragePool.query('select 1 from coverage_jobs limit 1')).rejects.toMatchObject({ code: '42501' });
    await expect(coveragePool.query('select 1 from monthly_request_budget limit 1')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

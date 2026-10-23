// ROADMAP 3.4 (decisión 257, D10; R5.5) — paso de privilegios del despliegue: aplica el bootstrap
// (`sql/bootstrap-roles-grants.sql`, con el bloque REVOKE al final) y compara una huella de los privilegios
// antes y después para informar «privileges unchanged» en la segunda ejecución. Contra PostgreSQL real, con
// roles de prueba (el SQL del bootstrap se aplica con los nombres de rol sustituidos; los roles reales
// `web_readonly`/`web_coverage` del entorno de desarrollo no se tocan).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrate.js';
import {
  applyBootstrapGrants,
  bootstrapGrantsSql,
  DEFAULT_ROLE_NAMES,
  privilegeFingerprint,
} from '../../src/privilege-fingerprint.js';
import type { RoleNames } from '../../src/privilege-fingerprint.js';
import { provisionRoles } from '../../src/provision-roles.js';
import { createScratchDatabase, dropRoles } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

const BOOTSTRAP_PATH = fileURLToPath(new URL('../../sql/bootstrap-roles-grants.sql', import.meta.url));

function suffix(): string {
  return randomBytes(4).toString('hex');
}

describe('bootstrapGrantsSql — sustitución de nombres de rol y orden del REVOKE', () => {
  it('con los nombres por defecto devuelve el fichero tal cual', () => {
    expect(bootstrapGrantsSql(DEFAULT_ROLE_NAMES)).toBe(readFileSync(BOOTSTRAP_PATH, 'utf8'));
    expect(DEFAULT_ROLE_NAMES).toEqual({ readonly: 'web_readonly', coverage: 'web_coverage' });
  });

  it('sustituye ambos nombres solo como palabra completa', () => {
    const sql = bootstrapGrantsSql({ readonly: 'ro_x1', coverage: 'cov_x1' });

    expect(sql).not.toMatch(/\bweb_readonly\b/);
    expect(sql).not.toMatch(/\bweb_coverage\b/);
    expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA public TO ro_x1;');
    expect(sql).toContain('GRANT INSERT ON TABLE coverage_jobs TO cov_x1;');
  });

  it('rechaza nombres que no sean identificadores simples', () => {
    expect(() => bootstrapGrantsSql({ readonly: 'a"; drop', coverage: 'cov' })).toThrow(/identificador/);
  });

  it('el bloque REVOKE va DESPUÉS del último GRANT y de los privilegios por defecto', () => {
    const sql = bootstrapGrantsSql(DEFAULT_ROLE_NAMES);
    const lastGrant = Math.max(sql.lastIndexOf('\nGRANT '), sql.lastIndexOf('ALTER DEFAULT PRIVILEGES'));
    const firstRevoke = sql.indexOf('REVOKE ALL ON TABLE monthly_request_budget');

    expect(lastGrant).toBeGreaterThan(0);
    expect(firstRevoke).toBeGreaterThan(lastGrant);
    expect(sql.trimEnd().endsWith('$$;')).toBe(true);
    expect(sql.lastIndexOf('REVOKE ALL ON TABLE proxy_rate_limit')).toBeGreaterThan(firstRevoke);
    expect(sql.lastIndexOf('REVOKE ALL ON TABLE alert_dispatch_log')).toBeGreaterThan(firstRevoke);
  });
});

describeWithTestDb('applyBootstrapGrants — matriz de privilegios y huella (decisión 257, D10)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let names: RoleNames;

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'grants');
    names = { readonly: `dpl_ro_${suffix()}`, coverage: `dpl_cov_${suffix()}` };
    const { db, pool: ownerPool } = createDb(scratch.url);
    pool = ownerPool;
    await runMigrations(db);
    await provisionRoles(pool, scratch.url, [
      { name: names.readonly, password: 'pw-readonly-1' },
      { name: names.coverage, password: 'pw-coverage-1' },
    ]);
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [names.readonly, names.coverage]);
  });

  async function grantsOf(role: string): Promise<readonly string[]> {
    const { rows } = await pool.query<{ grant: string }>(
      `select c.relname || ':' || a.privilege_type as grant
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       cross join lateral aclexplode(c.relacl) a
       join pg_roles r on r.oid = a.grantee and r.rolname = $1
       where c.relkind = 'r'
       order by 1`,
      [role]
    );
    return rows.map((row) => row.grant);
  }

  it('la primera aplicación cambia los privilegios y deja EXACTAMENTE la matriz documentada', async () => {
    const result = await applyBootstrapGrants(pool, names);

    expect(result).toEqual({ changed: true });
    expect(await grantsOf(names.coverage)).toEqual([
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
    const readonly = await grantsOf(names.readonly);
    expect(readonly.length).toBeGreaterThan(10);
    expect(readonly.every((grant) => grant.endsWith(':SELECT'))).toBe(true);
    // Tablas solo del propietario: invisibles para ambos roles web.
    expect(readonly).not.toContain('monthly_request_budget:SELECT');
    expect(readonly).not.toContain('proxy_rate_limit:SELECT');
    expect(readonly).toContain('listings:SELECT');
    expect((await grantsOf(names.coverage)).some((grant) => grant.startsWith('monthly_request_budget:'))).toBe(false);
  });

  it('la segunda aplicación no cambia nada: la huella es idéntica (privileges unchanged)', async () => {
    const before = await privilegeFingerprint(pool);

    const result = await applyBootstrapGrants(pool, names);

    expect(result).toEqual({ changed: false });
    expect(await privilegeFingerprint(pool)).toBe(before);
  });

  it('la huella cambia cuando cambia un privilegio (no es una constante)', async () => {
    const before = await privilegeFingerprint(pool);
    await pool.query(`grant delete on table coverage_jobs to "${names.coverage}"`);

    const tampered = await privilegeFingerprint(pool);
    expect(tampered).not.toBe(before);

    // El bootstrap NO revoca un privilegio de más sobre coverage_jobs: la huella lo delata (lo
    // detecta `checkPrivilegeMatrix`, no el bootstrap). Se deshace a mano para no contaminar.
    await pool.query(`revoke delete on table coverage_jobs from "${names.coverage}"`);
    expect(await privilegeFingerprint(pool)).toBe(before);
  });

  it('una tabla nueva del propietario: sin REVOKE la lee web_readonly (por defecto); con REVOKE, no', async () => {
    await pool.query('create table dpl_owner_only_without_revoke (id int)');
    await pool.query('create table dpl_owner_only_with_revoke (id int)');
    await pool.query(`revoke all on table dpl_owner_only_with_revoke from "${names.readonly}"`);

    const readable = await pool.query<{ allowed: boolean }>('select has_table_privilege($1, $2, $3) as allowed', [
      names.readonly,
      'dpl_owner_only_without_revoke',
      'SELECT',
    ]);
    const denied = await pool.query<{ allowed: boolean }>('select has_table_privilege($1, $2, $3) as allowed', [
      names.readonly,
      'dpl_owner_only_with_revoke',
      'SELECT',
    ]);

    expect(readable.rows[0]?.allowed).toBe(true);
    expect(denied.rows[0]?.allowed).toBe(false);
  });

  it('volver a aplicar el bootstrap con las tablas existentes conserva los REVOKE del bloque final', async () => {
    await applyBootstrapGrants(pool, names);

    const { rows } = await pool.query<{ table: string; allowed: boolean }>(
      `select t as table, has_table_privilege($1, t, 'SELECT') as allowed
       from unnest(array['monthly_request_budget', 'proxy_rate_limit', 'alert_dispatch_log']) as t`,
      [names.readonly]
    );
    expect(rows).toEqual([
      { table: 'monthly_request_budget', allowed: false },
      { table: 'proxy_rate_limit', allowed: false },
      { table: 'alert_dispatch_log', allowed: false },
    ]);
  });
});

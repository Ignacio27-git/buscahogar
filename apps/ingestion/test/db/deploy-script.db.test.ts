// ROADMAP 3.4 (decisión 257, D9; R2.3, R5.1-R5.8) — el script `deploy` como PROCESO, contra una base vacía real:
// esquema, roles, privilegios, una fila de cuota y catálogo; segunda ejecución «sin cambios»; códigos de
// salida (2 configuración, 3 base inaccesible, 4 comprobación) y ningún secreto en la salida. Los roles
// llevan sufijo aleatorio (variables `WEB_*_ROLE`): nunca se tocan `web_readonly`/`web_coverage` del entorno.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const INGESTION_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = 'scripts/deploy.ts';

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Entorno mínimo del proceso hijo: nada del entorno ambiente (credenciales, DATABASE_URL...) salvo lo que
// Node necesita para arrancar en cada plataforma.
function baseEnv(): Record<string, string> {
  const keep = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const env: Record<string, string> = {};
  for (const key of keep) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

async function runDeployScript(extraEnv: Record<string, string>): Promise<RunResult> {
  try {
    const { stdout, stderr } = await exec(process.execPath, ['--import', 'tsx', SCRIPT], {
      cwd: INGESTION_ROOT,
      env: { ...baseEnv(), ...extraEnv },
      timeout: 110_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

function lines(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const testUrl = process.env.DATABASE_URL ?? '';

describe.skipIf(testUrl === '')('script deploy — proceso completo (decisión 257)', () => {
  const suffix = randomBytes(4).toString('hex');
  const roleReadonly = `dpl_ro_${suffix}`;
  const roleCoverage = `dpl_cov_${suffix}`;
  const readonlyPassword = `ro-${randomBytes(6).toString('hex')}`;
  const coveragePassword = `cov-${randomBytes(6).toString('hex')}`;
  let databaseName = '';
  let scratchUrl = '';
  let owner: pg.Pool;
  const outputs: string[] = [];

  function maintenanceUrl(): string {
    const parsed = new URL(testUrl);
    parsed.pathname = '/postgres';
    return parsed.toString();
  }

  function deployEnv(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      DIRECT_DATABASE_URL: scratchUrl,
      WEB_READONLY_PASSWORD: readonlyPassword,
      WEB_COVERAGE_PASSWORD: coveragePassword,
      WEB_READONLY_ROLE: roleReadonly,
      WEB_COVERAGE_ROLE: roleCoverage,
      SEED_MONTHLY_QUOTA_TOTAL: '1000',
      SEED_MONTHLY_QUOTA_RESERVE: '200',
      ...overrides,
    };
  }

  beforeAll(async () => {
    const stem = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, '')).replace(/_ingestion_test$/, '');
    databaseName = `${stem}_ingestion_deploy_${suffix}_test`;
    const parsed = new URL(testUrl);
    parsed.pathname = `/${databaseName}`;
    scratchUrl = parsed.toString();
    const maintenance = new pg.Client({ connectionString: maintenanceUrl() });
    await maintenance.connect();
    try {
      await maintenance.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await maintenance.end();
    }
    owner = new pg.Pool({ connectionString: scratchUrl, max: 2 });
  });

  afterAll(async () => {
    await owner.end();
    const maintenance = new pg.Client({ connectionString: maintenanceUrl() });
    await maintenance.connect();
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await maintenance.query(`DROP ROLE IF EXISTS "${roleReadonly}"`);
      await maintenance.query(`DROP ROLE IF EXISTS "${roleCoverage}"`);
    } finally {
      await maintenance.end();
    }
  });

  it('sin DIRECT_DATABASE_URL: exit 2 con el motivo, aunque exista DATABASE_URL (no hay respaldo) y sin tocar la base', async () => {
    const env = deployEnv({ DATABASE_URL: scratchUrl });
    delete (env as Partial<Record<string, string>>).DIRECT_DATABASE_URL;

    const result = await runDeployScript(env);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/DIRECT_DATABASE_URL/);
    const { rows } = await owner.query<{ present: boolean }>(
      `select to_regclass('drizzle.__drizzle_migrations') is not null as present`
    );
    expect(rows[0]?.present).toBe(false);
  }, 60_000);

  it('secreto de rol en blanco: exit 2 antes de cualquier cambio', async () => {
    const result = await runDeployScript(deployEnv({ WEB_COVERAGE_PASSWORD: '   ' }));

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/WEB_COVERAGE_PASSWORD/);
  }, 60_000);

  it('base inaccesible: exit 3 con el paso «connect»', async () => {
    const unreachable = new URL(scratchUrl);
    unreachable.port = '1';

    const result = await runDeployScript(deployEnv({ DIRECT_DATABASE_URL: unreachable.toString() }));

    expect(result.code).toBe(3);
    const failure = lines(result.stderr).at(-1);
    expect(failure).toMatchObject({ level: 'error', step: 'connect', exit_code: 3 });
    outputs.push(result.stdout, result.stderr);
  }, 60_000);

  it('base vacía: exit 0 y deja esquema, roles, privilegios, una fila de cuota y el catálogo', async () => {
    const result = await runDeployScript(deployEnv());
    outputs.push(result.stdout, result.stderr);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const last = lines(result.stdout).at(-1);
    expect(last).toMatchObject({ level: 'info', step: 'deploy', msg: 'deploy complete' });
    expect(String(last?.summary)).toMatch(/^\d+ migrations, roles created, privileges changed, seeds applied$/);

    const roles = await owner.query<{ rolname: string }>('select rolname from pg_roles where rolname = any($1) order by 1', [
      [roleReadonly, roleCoverage],
    ]);
    expect(roles.rows.map((row) => row.rolname)).toEqual([roleCoverage, roleReadonly].sort());
    const quota = await owner.query('select total_cap, reserve from monthly_request_budget');
    expect(quota.rows).toEqual([{ total_cap: 1000, reserve: 200 }]);
    const locations = await owner.query<{ total: string }>('select count(*)::text as total from locations');
    expect(Number(locations.rows[0]?.total)).toBeGreaterThan(1000);
  }, 120_000);

  it('segunda ejecución: exit 0 y «0 migrations, roles unchanged, privileges unchanged, seeds skipped»', async () => {
    const before = await owner.query('select rolname, rolpassword from pg_authid where rolname = any($1) order by 1', [
      [roleReadonly, roleCoverage],
    ]);

    const result = await runDeployScript(deployEnv());
    outputs.push(result.stdout, result.stderr);

    expect(result.code).toBe(0);
    expect(lines(result.stdout).at(-1)).toMatchObject({
      step: 'deploy',
      summary: '0 migrations, roles unchanged, privileges unchanged, seeds skipped',
    });
    const after = await owner.query('select rolname, rolpassword from pg_authid where rolname = any($1) order by 1', [
      [roleReadonly, roleCoverage],
    ]);
    expect(after.rows).toEqual(before.rows);
  }, 120_000);

  it('una deriva de privilegios hace fallar la comprobación final con exit 4 y el paso «verify»', async () => {
    await owner.query(`grant insert on table listings to "${roleReadonly}"`);

    const result = await runDeployScript(deployEnv());
    outputs.push(result.stdout, result.stderr);

    expect(result.code).toBe(4);
    expect(lines(result.stderr).at(-1)).toMatchObject({ level: 'error', step: 'verify', exit_code: 4 });
    await owner.query(`revoke insert on table listings from "${roleReadonly}"`);
  }, 120_000);

  it('ninguna salida de ninguna ejecución contiene contraseñas, verificadores ni la URL del propietario', () => {
    const combined = outputs.join('\n');
    const ownerPassword = decodeURIComponent(new URL(scratchUrl).password);

    expect(combined.length).toBeGreaterThan(0);
    expect(combined).not.toContain(readonlyPassword);
    expect(combined).not.toContain(coveragePassword);
    expect(combined).not.toContain('SCRAM-SHA-256');
    expect(combined).not.toContain(scratchUrl);
    if (ownerPassword !== '') {
      expect(combined).not.toContain(ownerPassword);
    }
  });
});

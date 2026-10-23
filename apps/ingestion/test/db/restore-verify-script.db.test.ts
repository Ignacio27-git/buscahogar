// ROADMAP 3.4 (decisión 260, D18; R8.4) — el script `restore-verify` como PROCESO contra una base real
// desplegada: todas las comprobaciones pasan (exit 0); un privilegio alterado (web_readonly con SELECT sobre
// proxy_rate_limit) da exit 4 NOMBRANDO la comprobación; recuentos esperados distintos dan exit 4 en row-counts;
// base inaccesible exit 3; sin DIRECT_DATABASE_URL exit 2 (sin respaldo en DATABASE_URL). Roles con sufijo
// aleatorio: nunca se tocan los del entorno.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { runDeploy } from '@buscahogar/db/deploy';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const INGESTION_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = 'scripts/restore-verify.ts';

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

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

async function runVerify(extraEnv: Record<string, string>): Promise<RunResult> {
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

const testUrl = process.env.DATABASE_URL ?? '';

describe.skipIf(testUrl === '')('script restore-verify — proceso completo (decisión 260)', () => {
  const suffix = randomBytes(4).toString('hex');
  const roleReadonly = `drl_ro_${suffix}`;
  const roleCoverage = `drl_cov_${suffix}`;
  let databaseName = '';
  let scratchUrl = '';
  let owner: pg.Pool;

  function maintenanceUrl(): string {
    const parsed = new URL(testUrl);
    parsed.pathname = '/postgres';
    return parsed.toString();
  }

  function verifyEnv(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      DIRECT_DATABASE_URL: scratchUrl,
      WEB_READONLY_ROLE: roleReadonly,
      WEB_COVERAGE_ROLE: roleCoverage,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const stem = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, '')).replace(/_ingestion_test$/, '');
    databaseName = `${stem}_ingestion_verify_${suffix}_test`;
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
    // Catálogo mínimo: este test no necesita las ~8000 filas reales.
    await runDeploy({
      ownerUrl: scratchUrl,
      roleNames: { readonly: roleReadonly, coverage: roleCoverage },
      passwords: { readonly: `ro-${randomBytes(6).toString('hex')}`, coverage: `cov-${randomBytes(6).toString('hex')}` },
      quotaSeed: null,
      catalogue: [],
    });
    owner = new pg.Pool({ connectionString: scratchUrl, max: 2 });
  }, 120_000);

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

  it('sin DIRECT_DATABASE_URL: exit 2 aunque exista DATABASE_URL (no hay respaldo)', async () => {
    const env = verifyEnv({ DATABASE_URL: scratchUrl });
    delete (env as Partial<Record<string, string>>).DIRECT_DATABASE_URL;

    const result = await runVerify(env);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/DIRECT_DATABASE_URL/);
  }, 60_000);

  it('base inaccesible: exit 3', async () => {
    const unreachable = new URL(scratchUrl);
    unreachable.port = '1';

    const result = await runVerify(verifyEnv({ DIRECT_DATABASE_URL: unreachable.toString() }));

    expect(result.code).toBe(3);
  }, 60_000);

  it('base desplegada: exit 0, cinco comprobaciones informadas y ni la URL ni contraseñas en la salida', async () => {
    const result = await runVerify(verifyEnv());

    expect(result.code).toBe(0);
    const checks = result.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as { check?: string; ok?: boolean });
    expect(checks.filter((line) => line.check !== undefined).map((line) => line.check)).toEqual([
      'postgis-extension',
      'core-tables',
      'row-counts',
      'migration-journal',
      'privilege-matrix',
    ]);
    expect(result.stdout + result.stderr).not.toContain(new URL(scratchUrl).password);
  }, 60_000);

  it('privilegio alterado (web_readonly con SELECT sobre proxy_rate_limit): exit 4 nombrando privilege-matrix', async () => {
    await owner.query(`grant select on table proxy_rate_limit to "${roleReadonly}"`);

    const result = await runVerify(verifyEnv());

    expect(result.code).toBe(4);
    expect(result.stderr).toContain('failed checks: privilege-matrix');
    expect(result.stderr).toContain(`${roleReadonly} must not have SELECT on proxy_rate_limit`);

    await owner.query(`revoke select on table proxy_rate_limit from "${roleReadonly}"`);
    expect((await runVerify(verifyEnv())).code).toBe(0);
  }, 120_000);

  it('recuentos esperados distintos de los reales: exit 4 nombrando row-counts', async () => {
    const result = await runVerify(verifyEnv({ DRILL_EXPECTED_ROW_COUNTS: 'listings=999999' }));

    expect(result.code).toBe(4);
    expect(result.stderr).toContain('failed checks: row-counts');
    expect(result.stderr).toContain('listings: expected 999999, found 0');
  }, 60_000);
});

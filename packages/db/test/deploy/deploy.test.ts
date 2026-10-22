// ROADMAP 3.4 (decisión 257, D9; R5.1-R5.8, R2.3) — orquestación del despliegue sobre una base VACÍA real:
// migraciones → roles → privilegios → catálogo → cuota → comprobaciones (jit, matriz). Idempotente (la segunda
// ejecución informa «0 migrations, roles unchanged, privileges unchanged, seeds skipped»), con códigos de
// salida distintos por tipo de fallo y sin secretos en los registros. Roles de prueba con sufijo aleatorio.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DeployError, EXIT_CODES, redactSecrets, runDeploy } from '../../src/deploy.js';
import type { DeployConfig } from '../../src/deploy.js';
import type { DeployLogEvent } from '../../src/deploy-log.js';
import { MUNICIPALITY_CATALOGUE } from '../../src/seed-data.js';
import type { MunicipalitySeed } from '../../src/seed-data.js';
import { createScratchDatabase, dropRoles } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

const JOURNAL_PATH = fileURLToPath(new URL('../../migrations/meta/_journal.json', import.meta.url));

const BASE = MUNICIPALITY_CATALOGUE[0];
if (!BASE) {
  throw new Error('El catálogo hand-cited no puede estar vacío');
}
const SMALL_CATALOGUE: readonly MunicipalitySeed[] = ['18911', '18912'].map(
  (ineCode): MunicipalitySeed => ({ ...BASE, ineCode, municipality: `Prueba ${ineCode}`, searchName: `prueba ${ineCode}` })
);

function suffix(): string {
  return randomBytes(4).toString('hex');
}

function journalEntries(): number {
  return (JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as { entries: unknown[] }).entries.length;
}

describe('EXIT_CODES y redactSecrets', () => {
  it('la tabla de códigos de salida es la del diseño (0 ok, 1 paso, 2 config, 3 base, 4 comprobación)', () => {
    expect(EXIT_CODES).toEqual({ ok: 0, step: 1, config: 2, unreachable: 3, check: 4 });
  });

  it('redactSecrets elimina cada secreto y su forma codificada, y respeta los vacíos', () => {
    const text = 'fallo con pw-uno-1 y con p%40ss y otra vez pw-uno-1';

    expect(redactSecrets(text, ['pw-uno-1', 'p@ss', ''])).toBe('fallo con *** y con *** y otra vez ***');
    expect(redactSecrets('sin secretos', ['pw-uno-1'])).toBe('sin secretos');
  });
});

describeWithTestDb('runDeploy — base vacía, idempotencia y fallos (decisión 257)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let events: DeployLogEvent[];
  let base: DeployConfig;
  const readonlyPassword = `ro-${randomBytes(6).toString('hex')}`;
  const coveragePassword = `cov-${randomBytes(6).toString('hex')}`;
  const roleNames = { readonly: `dpl_ro_${suffix()}`, coverage: `dpl_cov_${suffix()}` };

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'run');
    pool = new pg.Pool({ connectionString: scratch.url, max: 2 });
    base = {
      ownerUrl: scratch.url,
      roleNames,
      passwords: { readonly: readonlyPassword, coverage: coveragePassword },
      quotaSeed: { totalCap: 1000, reserve: 200 },
      catalogue: SMALL_CATALOGUE,
    };
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [roleNames.readonly, roleNames.coverage]);
  });

  const log = (event: DeployLogEvent): void => {
    events.push(event);
  };

  async function verifiers(): Promise<string> {
    const { rows } = await pool.query<{ rolpassword: string }>(
      'select rolpassword from pg_authid where rolname = any($1) order by rolname',
      [[roleNames.readonly, roleNames.coverage]]
    );
    return rows.map((row) => row.rolpassword).join('|');
  }

  it('base vacía: aplica todo y deja esquema, roles, privilegios, una fila de cuota y el catálogo', async () => {
    events = [];

    const report = await runDeploy(base, log);

    expect(report).toMatchObject({
      migrations: journalEntries(),
      roles: { [roleNames.readonly]: 'created', [roleNames.coverage]: 'created' },
      privilegesChanged: true,
      catalogue: 'seeded',
      quota: 'seeded',
      jit: 'role',
    });
    expect(report.summary).toBe(`${String(journalEntries())} migrations, roles created, privileges changed, seeds applied`);
    const { rows: quota } = await pool.query('select total_cap, reserve from monthly_request_budget');
    expect(quota).toEqual([{ total_cap: 1000, reserve: 200 }]);
    const { rows: locations } = await pool.query<{ total: string }>('select count(*)::text as total from locations');
    expect(locations[0]?.total).toBe('2');
  });

  it('segunda ejecución: «0 migrations, roles unchanged, privileges unchanged, seeds skipped» y verificadores intactos', async () => {
    const before = await verifiers();
    events = [];

    const report = await runDeploy(base, log);

    expect(report).toMatchObject({
      migrations: 0,
      roles: { [roleNames.readonly]: 'unchanged', [roleNames.coverage]: 'unchanged' },
      privilegesChanged: false,
      catalogue: 'skipped',
      quota: 'skipped',
    });
    expect(report.summary).toBe('0 migrations, roles unchanged, privileges unchanged, seeds skipped');
    expect(await verifiers()).toBe(before);
    expect(events.at(-1)).toMatchObject({ level: 'info', step: 'deploy', summary: report.summary });
  });

  it('la cuota editada por el responsable no cambia aunque la configuración de siembra sea otra', async () => {
    await pool.query('update monthly_request_budget set total_cap = 5000, reserve = 500');

    const report = await runDeploy({ ...base, quotaSeed: { totalCap: 1, reserve: 0 } }, log);

    expect(report.quota).toBe('skipped');
    const { rows } = await pool.query('select total_cap, reserve from monthly_request_budget');
    expect(rows).toEqual([{ total_cap: 5000, reserve: 500 }]);
  });

  it('sin configuración de cuota y con el registro vacío: aviso ruidoso, no inventa valores', async () => {
    await pool.query('delete from monthly_request_budget');
    events = [];

    const report = await runDeploy({ ...base, quotaSeed: null }, log);

    expect(report.quota).toBe('not-configured');
    const warning = events.find((event) => event.level === 'warn' && event.step === 'quota');
    expect(warning?.msg).toMatch(/SEED_MONTHLY_QUOTA_TOTAL/);
    const { rows } = await pool.query<{ total: string }>('select count(*)::text as total from monthly_request_budget');
    expect(rows[0]?.total).toBe('0');
  });

  it('sin configuración de cuota pero con una fila ya fijada: sin aviso', async () => {
    await pool.query(
      `insert into monthly_request_budget (month, source_id, total_cap, reserve)
       select date_trunc('month', now() at time zone 'utc')::date, id, 800, 100 from sources where key = 'idealista'`
    );
    events = [];

    const report = await runDeploy({ ...base, quotaSeed: null }, log);

    expect(report.quota).toBe('skipped');
    expect(events.filter((event) => event.level === 'warn')).toEqual([]);
  });

  it('ni las contraseñas, ni la contraseña del propietario, ni ningún verificador aparecen en los registros', () => {
    const ownerPassword = decodeURIComponent(new URL(scratch.url).password);
    const serialised = JSON.stringify(events);

    expect(serialised).not.toContain(readonlyPassword);
    expect(serialised).not.toContain(coveragePassword);
    expect(serialised).not.toContain('SCRAM-SHA-256');
    if (ownerPassword !== '') {
      expect(serialised).not.toContain(ownerPassword);
    }
  });

  it('un privilegio de más sobre una tabla (deriva) hace fallar la comprobación final con exit 4', async () => {
    await pool.query(`grant insert on table listings to "${roleNames.readonly}"`);

    const attempt = runDeploy(base, log);

    await expect(attempt).rejects.toBeInstanceOf(DeployError);
    await expect(attempt).rejects.toMatchObject({ step: 'verify', exitCode: EXIT_CODES.check });
    await expect(attempt).rejects.toThrow(/must not have INSERT on listings/);

    await pool.query(`revoke insert on table listings from "${roleNames.readonly}"`);
    expect((await runDeploy(base, log)).privilegesChanged).toBe(false);
  });
});

describeWithTestDb('runDeploy — configuración, base inaccesible y fallo de paso', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  const roleNames = { readonly: `dpl_ro_${suffix()}`, coverage: `dpl_cov_${suffix()}` };
  const passwords = { readonly: 'pw-readonly-cfg', coverage: 'pw-coverage-cfg' };

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'runfail');
    pool = new pg.Pool({ connectionString: scratch.url, max: 2 });
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [roleNames.readonly, roleNames.coverage]);
  });

  it('un secreto en blanco: exit 2 en el paso «config» ANTES de tocar nada (ni siquiera hay registro de migraciones)', async () => {
    const attempt = runDeploy(
      { ownerUrl: scratch.url, roleNames, passwords: { readonly: passwords.readonly, coverage: '  ' }, quotaSeed: null },
      () => undefined
    );

    await expect(attempt).rejects.toMatchObject({ step: 'config', exitCode: EXIT_CODES.config });
    const { rows } = await pool.query<{ present: boolean }>(
      `select to_regclass('drizzle.__drizzle_migrations') is not null as present`
    );
    expect(rows[0]?.present).toBe(false);
  });

  it('cuota de siembra inválida (reserva >= total): exit 2 antes de cualquier cambio', async () => {
    const attempt = runDeploy(
      { ownerUrl: scratch.url, roleNames, passwords, quotaSeed: { totalCap: 10, reserve: 10 } },
      () => undefined
    );

    await expect(attempt).rejects.toMatchObject({ step: 'config', exitCode: EXIT_CODES.config });
  });

  it('base inaccesible: exit 3 en el paso «connect»', async () => {
    const unreachable = new URL(scratch.url);
    unreachable.port = '1';

    const attempt = runDeploy(
      { ownerUrl: unreachable.toString(), roleNames, passwords, quotaSeed: null },
      () => undefined
    );

    await expect(attempt).rejects.toMatchObject({ step: 'connect', exitCode: EXIT_CODES.unreachable });
    await expect(attempt).rejects.not.toThrow(new URL(scratch.url).password || 'sin-contraseña-que-buscar');
  });

  it('un paso que falla (catálogo inválido) nombra el paso con exit 1, y lo ya aplicado se puede repetir', async () => {
    const invalid: MunicipalitySeed = { ...(MUNICIPALITY_CATALOGUE[0] as MunicipalitySeed), ineCode: '18' };
    const config: DeployConfig = { ownerUrl: scratch.url, roleNames, passwords, quotaSeed: null };

    const attempt = runDeploy({ ...config, catalogue: [invalid] }, () => undefined);

    await expect(attempt).rejects.toMatchObject({ step: 'catalogue', exitCode: EXIT_CODES.step });
    // Migraciones, roles y privilegios ya estaban aplicados: la repetición los reconoce y completa el resto.
    const retry = await runDeploy({ ...config, catalogue: [MUNICIPALITY_CATALOGUE[0] as MunicipalitySeed] }, () => undefined);
    expect(retry).toMatchObject({
      migrations: 0,
      roles: { [roleNames.readonly]: 'unchanged', [roleNames.coverage]: 'unchanged' },
      privilegesChanged: false,
      catalogue: 'seeded',
    });
  });
});

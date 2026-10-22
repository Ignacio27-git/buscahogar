// ROADMAP 3.4 (decisión 264 enmienda la 101; D11, PD10; R2.4, R5.5) — comprobaciones posteriores al
// despliegue. (1) JIT apagado para `web_readonly`: preferente a nivel de rol; si el proveedor no lo permite,
// respaldo a nivel de base de datos; si aun así sigue encendido, el despliegue falla (exit 4). (2) Matriz de
// privilegios final de los dos roles web. Contra PostgreSQL real, con roles de prueba.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkPrivilegeMatrix, DeployCheckError, ensureJitOff, OWNER_ONLY_TABLES } from '../../src/deploy-verify.js';
import type { DeployLogEvent } from '../../src/deploy-log.js';
import { createDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrate.js';
import { applyBootstrapGrants, bootstrapGrantsSql } from '../../src/privilege-fingerprint.js';
import type { RoleNames } from '../../src/privilege-fingerprint.js';
import { provisionRoles, roleLoginUrl } from '../../src/provision-roles.js';
import { createScratchDatabase, dropRoles } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

const BOOTSTRAP_PATH = fileURLToPath(new URL('../../sql/bootstrap-roles-grants.sql', import.meta.url));

function suffix(): string {
  return randomBytes(4).toString('hex');
}

describeWithTestDb('ensureJitOff — estrategias rol/base de datos y fallo (decisión 264)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let names: RoleNames;
  const password = 'pw-readonly-jit';

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'jit');
    names = { readonly: `dpl_ro_${suffix()}`, coverage: `dpl_cov_${suffix()}` };
    const { db, pool: ownerPool } = createDb(scratch.url);
    pool = ownerPool;
    await runMigrations(db);
    await provisionRoles(pool, scratch.url, [
      { name: names.readonly, password },
      { name: names.coverage, password: 'pw-coverage-jit' },
    ]);
    await applyBootstrapGrants(pool, names);
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [names.readonly, names.coverage]);
  });

  const readonlyUrl = (): string => roleLoginUrl(scratch.url, names.readonly, password);

  async function showJitAsReadonly(): Promise<string> {
    const client = new pg.Client({ connectionString: readonlyUrl() });
    await client.connect();
    try {
      const { rows } = await client.query<{ jit: string }>('show jit');
      return rows[0]?.jit ?? '';
    } finally {
      await client.end();
    }
  }

  async function resetJitSettings(): Promise<void> {
    await pool.query(`alter role "${names.readonly}" in database "${scratch.name}" reset jit`);
    await pool.query(`alter database "${scratch.name}" reset jit`);
  }

  it('con el ajuste a nivel de rol del bootstrap: SHOW jit es off y la estrategia es «role»', async () => {
    expect(await showJitAsReadonly()).toBe('off');
    const events: DeployLogEvent[] = [];

    const strategy = await ensureJitOff(pool, readonlyUrl(), names.readonly, (event) => events.push(event));

    expect(strategy).toBe('role');
    expect(events.filter((event) => event.level === 'warn')).toEqual([]);
  });

  it('rol rechazado (sin ajuste de rol): aplica ALTER DATABASE, registra el respaldo y SHOW jit queda off', async () => {
    await resetJitSettings();
    expect(await showJitAsReadonly()).toBe('on');
    const events: DeployLogEvent[] = [];

    const strategy = await ensureJitOff(pool, readonlyUrl(), names.readonly, (event) => events.push(event));

    expect(strategy).toBe('database');
    expect(await showJitAsReadonly()).toBe('off');
    expect(events.some((event) => event.level === 'warn' && /database-level/.test(event.msg))).toBe(true);
  });

  it('segunda ejecución con el respaldo ya aplicado: «database» sin volver a avisar', async () => {
    const events: DeployLogEvent[] = [];

    const strategy = await ensureJitOff(pool, readonlyUrl(), names.readonly, (event) => events.push(event));

    expect(strategy).toBe('database');
    expect(events.filter((event) => event.level === 'warn')).toEqual([]);
  });

  it('si tras el respaldo SHOW jit sigue en on (ajuste de rol contrario), falla con DeployCheckError «jit»', async () => {
    await resetJitSettings();
    await pool.query(`alter role "${names.readonly}" in database "${scratch.name}" set jit = on`);

    const attempt = ensureJitOff(pool, readonlyUrl(), names.readonly, () => undefined);

    await expect(attempt).rejects.toBeInstanceOf(DeployCheckError);
    await expect(attempt).rejects.toMatchObject({ check: 'jit' });
  });

  it('el bloque jit del bootstrap tolera insufficient_privilege con un aviso (simulado sobre el bloque real)', async () => {
    const source = readFileSync(BOOTSTRAP_PATH, 'utf8');
    const jitBlock = (source.match(/DO \$\$[\s\S]*?\$\$;/g) ?? []).find((block) => block.includes('SET jit = off'));
    if (jitBlock === undefined) {
      throw new Error('El bootstrap ya no contiene el bloque de jit');
    }
    // Se sustituye SOLO la sentencia que un proveedor gestionado rechazaría; el manejador es el real.
    const simulated = jitBlock.replace(
      /EXECUTE format\('ALTER ROLE[^;]*;/,
      `RAISE EXCEPTION 'simulado' USING ERRCODE = 'insufficient_privilege';`
    );
    expect(simulated).not.toBe(jitBlock);
    const notices: string[] = [];
    const client = new pg.Client({ connectionString: scratch.url });
    client.on('notice', (notice) => notices.push(notice.message ?? ''));
    await client.connect();
    try {
      await client.query(simulated);
    } finally {
      await client.end();
    }

    expect(notices.some((message) => message.includes('insufficient_privilege'))).toBe(true);
  });
});

describeWithTestDb('checkPrivilegeMatrix — matriz final de los roles web (R5.5)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let names: RoleNames;

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'matrix');
    names = { readonly: `dpl_ro_${suffix()}`, coverage: `dpl_cov_${suffix()}` };
    const { db, pool: ownerPool } = createDb(scratch.url);
    pool = ownerPool;
    await runMigrations(db);
    await provisionRoles(pool, scratch.url, [
      { name: names.readonly, password: 'pw-readonly-mx' },
      { name: names.coverage, password: 'pw-coverage-mx' },
    ]);
    await applyBootstrapGrants(pool, names);
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [names.readonly, names.coverage]);
  });

  it('tras el bootstrap no hay ningún desajuste', async () => {
    expect(await checkPrivilegeMatrix(pool, names)).toEqual([]);
    expect(OWNER_ONLY_TABLES).toEqual(['monthly_request_budget', 'proxy_rate_limit']);
  });

  it('un SELECT de web_readonly sobre proxy_rate_limit se nombra como fallo', async () => {
    await pool.query(`grant select on table proxy_rate_limit to "${names.readonly}"`);

    const failures = await checkPrivilegeMatrix(pool, names);

    expect(failures).toEqual([`${names.readonly} must not have SELECT on proxy_rate_limit`]);

    // El bootstrap vuelve a aplicar el REVOKE final y la matriz se recupera.
    await applyBootstrapGrants(pool, names);
    expect(await checkPrivilegeMatrix(pool, names)).toEqual([]);
  });

  it('un privilegio de escritura de web_coverage fuera de su lista se nombra como fallo', async () => {
    await pool.query(`grant delete on table coverage_jobs to "${names.coverage}"`);

    expect(await checkPrivilegeMatrix(pool, names)).toEqual([`${names.coverage} must not have DELETE on coverage_jobs`]);

    await pool.query(`revoke delete on table coverage_jobs from "${names.coverage}"`);
    expect(await checkPrivilegeMatrix(pool, names)).toEqual([]);
  });

  it('un privilegio que falta (web_coverage sin INSERT en zone_query_signals) y una escritura de web_readonly se nombran', async () => {
    await pool.query(`revoke insert on table zone_query_signals from "${names.coverage}"`);
    await pool.query(`grant insert on table listings to "${names.readonly}"`);

    const failures = await checkPrivilegeMatrix(pool, names);

    expect(failures).toEqual(
      expect.arrayContaining([
        `${names.coverage} must have INSERT on zone_query_signals`,
        `${names.readonly} must not have INSERT on listings`,
      ])
    );
    expect(failures).toHaveLength(2);

    await applyBootstrapGrants(pool, names);
    await pool.query(`revoke insert on table listings from "${names.readonly}"`);
    expect(await checkPrivilegeMatrix(pool, names)).toEqual([]);
  });

  it('bootstrapGrantsSql sigue siendo la única definición de privilegios (el REVOKE final nombra las tablas del propietario)', () => {
    const sql = bootstrapGrantsSql(names);

    for (const table of OWNER_ONLY_TABLES) {
      expect(sql).toContain(`REVOKE ALL ON TABLE ${table}`);
    }
  });
});

describe('DeployCheckError', () => {
  it('lleva el nombre de la comprobación fallida', () => {
    const error = new DeployCheckError('privileges', 'detalle');

    expect(error.check).toBe('privileges');
    expect(error.message).toBe('detalle');
  });
});

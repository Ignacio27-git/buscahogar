// ROADMAP 3.4 (decisión 257, D10; R5.2-R5.4) — aprovisionamiento IDEMPOTENTE de roles. Contra un
// PostgreSQL real: crea el rol que falta con el verificador SCRAM calculado en Node, no reescribe nada
// si el inicio de sesión con el secreto actual ya funciona (segunda ejecución = «sin cambios»), rota el
// verificador solo si el secreto cambió (28P01) y falla fuerte si, tras crear o rotar, el rol no puede
// iniciar sesión. La contraseña en claro nunca aparece en SQL, registros ni mensajes de error.
//
// Los roles de prueba llevan un sufijo aleatorio (los roles son del servidor, no de la base): nunca se
// toca `web_readonly` ni `web_coverage` del entorno de desarrollo.
import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  canLogin,
  provisionRole,
  provisionRoles,
  RoleConfigError,
  RoleProvisionError,
} from '../../src/provision-roles.js';
import type { DeployLogEvent } from '../../src/deploy-log.js';
import { createScratchDatabase, dropRoles, urlAsRole } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

function uniqueRole(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

describeWithTestDb('provisionRole — creación, «sin cambios» y rotación (decisión 257, D10)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  const created: string[] = [];

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'roles');
    pool = new pg.Pool({ connectionString: scratch.url, max: 2 });
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, created);
  });

  async function roleRow(name: string): Promise<Record<string, unknown> | undefined> {
    const { rows } = await pool.query(
      `select r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, a.rolpassword
       from pg_roles r join pg_authid a on a.oid = r.oid where r.rolname = $1`,
      [name]
    );
    return rows[0] as Record<string, unknown> | undefined;
  }

  it('crea el rol que falta con LOGIN y sin privilegios elevados, y puede iniciar sesión con su secreto', async () => {
    const name = uniqueRole('dpl_new');
    created.push(name);
    const password = `pw-${randomBytes(6).toString('hex')}`;

    const outcome = await provisionRole(pool, scratch.url, { name, password });

    expect(outcome).toBe('created');
    const row = await roleRow(name);
    expect(row).toMatchObject({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
    });
    expect(String(row?.rolpassword)).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(await canLogin(urlAsRole(scratch.url, name, password))).toBe(true);
    // Triangulación: con otra contraseña el servidor la rechaza (si fuera «trust», este test lo delataría).
    expect(await canLogin(urlAsRole(scratch.url, name, `${password}-mal`))).toBe(false);
  });

  it('segunda ejecución con el mismo secreto: «unchanged» y el verificador almacenado no se toca', async () => {
    const name = uniqueRole('dpl_same');
    created.push(name);
    const password = `pw-${randomBytes(6).toString('hex')}`;
    await provisionRole(pool, scratch.url, { name, password });
    const before = (await roleRow(name))?.rolpassword;

    const outcome = await provisionRole(pool, scratch.url, { name, password });

    expect(outcome).toBe('unchanged');
    // La sal es aleatoria: si se hubiera reescrito, el verificador sería otro.
    expect((await roleRow(name))?.rolpassword).toBe(before);
  });

  it('secreto cambiado (28P01): rota el verificador, el nuevo secreto entra y el viejo ya no', async () => {
    const name = uniqueRole('dpl_rot');
    created.push(name);
    const oldPassword = `old-${randomBytes(6).toString('hex')}`;
    const newPassword = `new-${randomBytes(6).toString('hex')}`;
    await provisionRole(pool, scratch.url, { name, password: oldPassword });
    const before = (await roleRow(name))?.rolpassword;

    const outcome = await provisionRole(pool, scratch.url, { name, password: newPassword });

    expect(outcome).toBe('rotated');
    expect((await roleRow(name))?.rolpassword).not.toBe(before);
    expect(await canLogin(urlAsRole(scratch.url, name, newPassword))).toBe(true);
    expect(await canLogin(urlAsRole(scratch.url, name, oldPassword))).toBe(false);
  });

  it('si tras crear el rol no puede iniciar sesión, falla fuerte con el motivo explícito', async () => {
    const name = uniqueRole('dpl_bad');
    created.push(name);

    const attempt = provisionRole(pool, scratch.url, { name, password: 'pw-fallo-1' }, { canLogin: () => Promise.resolve(false) });

    await expect(attempt).rejects.toBeInstanceOf(RoleProvisionError);
    await expect(attempt).rejects.toThrow(/verificador SCRAM/);
    await expect(attempt).rejects.not.toThrow(/pw-fallo-1/);
  });

  it('si tras rotar el rol sigue sin poder iniciar sesión, también falla fuerte', async () => {
    const name = uniqueRole('dpl_bad2');
    created.push(name);
    await provisionRole(pool, scratch.url, { name, password: 'pw-original-1' });

    await expect(
      provisionRole(pool, scratch.url, { name, password: 'pw-cambiada-1' }, { canLogin: () => Promise.resolve(false) })
    ).rejects.toThrow(/verificador SCRAM/);
  });

  it('un rol existente con atributos elevados (CREATEDB) se rechaza: el aprovisionamiento no los degrada en silencio', async () => {
    const name = uniqueRole('dpl_priv');
    created.push(name);
    await pool.query(`create role "${name}" login createdb`);

    await expect(provisionRole(pool, scratch.url, { name, password: 'pw-privilegiado-1' })).rejects.toThrow(
      /atributos/
    );
  });

  it('la contraseña ni el verificador aparecen en los eventos de registro', async () => {
    const name = uniqueRole('dpl_log');
    created.push(name);
    const password = `Secret-Marker-${randomBytes(6).toString('hex')}`;
    const events: DeployLogEvent[] = [];

    await provisionRole(pool, scratch.url, { name, password }, { log: (event) => events.push(event) });
    await provisionRole(pool, scratch.url, { name, password }, { log: (event) => events.push(event) });

    expect(events.map((event) => event.msg)).toEqual(['role created', 'role unchanged']);
    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain(password);
    expect(serialised).not.toContain('SCRAM-SHA-256');
    expect(serialised).toContain(name);
  });
});

describeWithTestDb('provisionRoles — secretos ausentes antes de cualquier cambio (R5.4)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  const created: string[] = [];

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'rolescfg');
    pool = new pg.Pool({ connectionString: scratch.url, max: 2 });
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, created);
  });

  it('un secreto vacío o en blanco aborta con RoleConfigError sin crear NINGÚN rol', async () => {
    const valid = uniqueRole('dpl_ok');
    const blank = uniqueRole('dpl_blank');
    created.push(valid, blank);

    await expect(
      provisionRoles(pool, scratch.url, [
        { name: valid, password: 'pw-valido-1' },
        { name: blank, password: '   ' },
      ])
    ).rejects.toBeInstanceOf(RoleConfigError);

    const { rows } = await pool.query('select rolname from pg_roles where rolname = any($1)', [[valid, blank]]);
    expect(rows).toEqual([]);
  });

  it('con secretos válidos devuelve el resultado por rol; repetido, todos «unchanged»', async () => {
    const first = uniqueRole('dpl_a');
    const second = uniqueRole('dpl_b');
    created.push(first, second);
    const specs = [
      { name: first, password: 'pw-primero-1' },
      { name: second, password: 'pw-segundo-1' },
    ];

    expect(await provisionRoles(pool, scratch.url, specs)).toEqual({ [first]: 'created', [second]: 'created' });
    expect(await provisionRoles(pool, scratch.url, specs)).toEqual({ [first]: 'unchanged', [second]: 'unchanged' });
  });

  it('rechaza nombres de rol que no sean identificadores simples (se interpolan entre comillas)', async () => {
    await expect(provisionRoles(pool, scratch.url, [{ name: 'x"; drop table y; --', password: 'pw-valido-1' }])).rejects.toBeInstanceOf(
      RoleConfigError
    );
  });
});

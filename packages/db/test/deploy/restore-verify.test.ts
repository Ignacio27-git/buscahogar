// ROADMAP 3.4 (decisión 260, D18; R8.4) — comprobaciones del simulacro de restauración. Tras restaurar la copia
// en una base vacía y repetir el aprovisionamiento (la ruta del despliegue), el simulacro exige cinco cosas, cada
// una con nombre propio para que un fallo diga QUÉ falló: extensión PostGIS, tablas núcleo, recuentos de filas,
// diario de migraciones = ficheros de migración y matriz de privilegios (la misma de `deploy-verify`).
// Contra PostgreSQL real, con roles de prueba.
import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrate.js';
import { applyBootstrapGrants } from '../../src/privilege-fingerprint.js';
import type { RoleNames } from '../../src/privilege-fingerprint.js';
import { provisionRoles } from '../../src/provision-roles.js';
import { CORE_TABLES, parseExpectedRowCounts, RESTORE_CHECKS, runRestoreChecks } from '../../src/restore-verify.js';
import type { RestoreCheckResult } from '../../src/restore-verify.js';
import { createScratchDatabase, dropRoles } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

function suffix(): string {
  return randomBytes(4).toString('hex');
}

function byName(results: readonly RestoreCheckResult[], check: string): RestoreCheckResult {
  const found = results.find((result) => result.check === check);
  if (found === undefined) {
    throw new Error(`El resultado no contiene la comprobación «${check}»`);
  }
  return found;
}

describe('parseExpectedRowCounts — «tabla=n,tabla=n»', () => {
  it('vacío o ausente = sin recuentos esperados', () => {
    expect(parseExpectedRowCounts(undefined)).toEqual({});
    expect(parseExpectedRowCounts('')).toEqual({});
    expect(parseExpectedRowCounts('   ')).toEqual({});
  });

  it('lee pares y recorta espacios', () => {
    expect(parseExpectedRowCounts('listings=12, sources = 1')).toEqual({ listings: 12, sources: 1 });
  });

  it('rechaza un formato inválido, un nombre que no es un identificador simple y un recuento negativo', () => {
    expect(() => parseExpectedRowCounts('listings')).toThrow(/DRILL_EXPECTED_ROW_COUNTS/);
    expect(() => parseExpectedRowCounts('listings=-1')).toThrow(/DRILL_EXPECTED_ROW_COUNTS/);
    expect(() => parseExpectedRowCounts('listings=1.5')).toThrow(/DRILL_EXPECTED_ROW_COUNTS/);
    expect(() => parseExpectedRowCounts('li stings=1')).toThrow(/DRILL_EXPECTED_ROW_COUNTS/);
    expect(() => parseExpectedRowCounts('"x"; drop table y;--=1')).toThrow(/DRILL_EXPECTED_ROW_COUNTS/);
  });
});

describeWithTestDb('runRestoreChecks — simulacro de restauración (R8.4)', (testUrl) => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let names: RoleNames;

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'drill');
    names = { readonly: `drl_ro_${suffix()}`, coverage: `drl_cov_${suffix()}` };
    const { db, pool: ownerPool } = createDb(scratch.url);
    pool = ownerPool;
    await runMigrations(db);
    await provisionRoles(pool, scratch.url, [
      { name: names.readonly, password: 'pw-readonly-drill' },
      { name: names.coverage, password: 'pw-coverage-drill' },
    ]);
    await applyBootstrapGrants(pool, names);
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    await dropRoles(testUrl, [names.readonly, names.coverage]);
  });

  it('una base recién desplegada pasa las cinco comprobaciones, en orden y con nombre', async () => {
    const results = await runRestoreChecks(pool, { names });

    expect(results.map((result) => result.check)).toEqual([...RESTORE_CHECKS]);
    expect(RESTORE_CHECKS).toEqual([
      'postgis-extension',
      'core-tables',
      'row-counts',
      'migration-journal',
      'privilege-matrix',
    ]);
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(CORE_TABLES).toEqual(
      expect.arrayContaining(['sources', 'locations', 'zones', 'listings', 'listing_versions', 'properties', 'property_listings'])
    );
  });

  it('el detalle de recuentos informa de cada tabla núcleo aunque no se esperara ninguno', async () => {
    const results = await runRestoreChecks(pool, { names });

    const detail = byName(results, 'row-counts').detail;
    for (const table of CORE_TABLES) {
      expect(detail).toContain(`${table}=`);
    }
  });

  it('un recuento esperado que coincide pasa y uno que no coincide falla nombrando tabla, esperado y real', async () => {
    const actual = await pool.query<{ total: string }>('select count(*)::text as total from sources');
    const total = Number(actual.rows[0]?.total ?? '0');

    const good = await runRestoreChecks(pool, { names, expectedRowCounts: { sources: total } });
    expect(byName(good, 'row-counts').ok).toBe(true);

    const bad = await runRestoreChecks(pool, { names, expectedRowCounts: { sources: total + 7 } });
    const row = byName(bad, 'row-counts');
    expect(row.ok).toBe(false);
    expect(row.detail).toContain(`sources: expected ${String(total + 7)}, found ${String(total)}`);
  });

  it('un recuento esperado de una tabla inexistente falla sin ejecutar SQL con ese nombre', async () => {
    const results = await runRestoreChecks(pool, { names, expectedRowCounts: { no_such_table: 1 } });

    const row = byName(results, 'row-counts');
    expect(row.ok).toBe(false);
    expect(row.detail).toContain('no_such_table');
  });

  it('un SELECT de web_readonly sobre proxy_rate_limit hace fallar privilege-matrix y lo nombra', async () => {
    await pool.query(`grant select on table proxy_rate_limit to "${names.readonly}"`);

    const results = await runRestoreChecks(pool, { names });

    const matrix = byName(results, 'privilege-matrix');
    expect(matrix.ok).toBe(false);
    expect(matrix.detail).toContain(`${names.readonly} must not have SELECT on proxy_rate_limit`);
    expect(results.filter((result) => !result.ok).map((result) => result.check)).toEqual(['privilege-matrix']);

    await applyBootstrapGrants(pool, names);
    expect((await runRestoreChecks(pool, { names })).every((result) => result.ok)).toBe(true);
  });

  it('un diario de migraciones al que le falta una fila falla en migration-journal', async () => {
    const saved = await pool.query<{ hash: string; created_at: string }>(
      'select hash, created_at::text from drizzle.__drizzle_migrations order by created_at desc limit 1'
    );
    const last = saved.rows[0];
    if (last === undefined) {
      throw new Error('La base de prueba no tiene diario de migraciones');
    }
    await pool.query('delete from drizzle.__drizzle_migrations where created_at = $1', [last.created_at]);

    const results = await runRestoreChecks(pool, { names });

    expect(byName(results, 'migration-journal').ok).toBe(false);
    expect(byName(results, 'migration-journal').detail).toMatch(/journal/);

    await pool.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [last.hash, last.created_at]);
    expect(byName(await runRestoreChecks(pool, { names }), 'migration-journal').ok).toBe(true);
  });

  it('una base vacía (sin PostGIS, sin tablas, sin diario) falla en las cuatro comprobaciones de estructura', async () => {
    const empty = await createScratchDatabase(testUrl, 'drillempty');
    const { pool: emptyPool } = createDb(empty.url);
    try {
      const results = await runRestoreChecks(emptyPool, { names });

      expect(byName(results, 'postgis-extension').ok).toBe(false);
      expect(byName(results, 'core-tables').ok).toBe(false);
      expect(byName(results, 'core-tables').detail).toContain('listings');
      expect(byName(results, 'migration-journal').ok).toBe(false);
    } finally {
      await emptyPool.end();
      await empty.drop();
    }
  });
});

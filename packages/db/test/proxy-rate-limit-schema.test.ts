// ROADMAP 3.4 (decisión 255, D2/D5b; migración 0020) — la tabla del limitador compartido y su REVOKE
// condicional. Se prueba contra PostgreSQL real con SQL plano, sin pasar por el almacén.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

const MIGRATION_PATH = fileURLToPath(new URL('../migrations/0020_proxy_rate_limit.sql', import.meta.url));

function revokeBlock(): string {
  const statements = readFileSync(MIGRATION_PATH, 'utf8').split('--> statement-breakpoint');
  const block = statements.find((statement) => /REVOKE ALL ON TABLE proxy_rate_limit/.test(statement));
  if (block === undefined) {
    throw new Error('La migración 0020 no contiene el bloque REVOKE sobre proxy_rate_limit');
  }
  return block;
}

describeWithDb('proxy_rate_limit — esquema y REVOKE (decisión 255, migración 0020)', () => {
  let pool: Pool;

  beforeAll(() => {
    ({ pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('crea las tres columnas con sus tipos y la clave primaria en key_hash', async () => {
    const columns = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'proxy_rate_limit' order by ordinal_position`
    );
    expect(columns.rows).toEqual([
      { column_name: 'key_hash', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'window_start_ms', data_type: 'bigint', is_nullable: 'NO' },
      { column_name: 'hits', data_type: 'integer', is_nullable: 'NO' },
    ]);
    const pk = await pool.query<{ column_name: string }>(
      `select a.attname as column_name from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = 'proxy_rate_limit'::regclass and i.indisprimary`
    );
    expect(pk.rows).toEqual([{ column_name: 'key_hash' }]);
  });

  it('el CHECK rechaza hits < 1 y acepta hits = 1', async () => {
    await expect(
      pool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('k0', 0, 0)")
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query("insert into proxy_rate_limit (key_hash, window_start_ms, hits) values ('k1', 0, 1)");
    const { rows } = await pool.query<{ hits: number }>("select hits from proxy_rate_limit where key_hash = 'k1'");
    expect(rows).toEqual([{ hits: 1 }]);
  });

  it('tiene un índice sobre window_start_ms (la purga acotada no recorre la tabla entera)', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'proxy_rate_limit' and indexname <> 'proxy_rate_limit_pkey'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('(window_start_ms)');
  });

  it('la migración es aditiva: solo crea proxy_rate_limit y revoca sobre ella', () => {
    const sqlText = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sqlText).toMatch(/create table "proxy_rate_limit"/i);
    expect(sqlText).not.toMatch(/\bdrop\s+(table|column|index)\b/i);
    expect(sqlText).not.toMatch(/\balter\s+table\b/i);
  });

  it('el bloque REVOKE no falla si web_readonly no existe, y quita un SELECT concedido cuando existe', async () => {
    const role = await pool.query("select 1 from pg_roles where rolname = 'web_readonly'");
    if (role.rowCount === 0) {
      // Entorno recién creado, sin roles: el bloque debe ser un no-op, nunca un fallo.
      await expect(pool.query(revokeBlock())).resolves.toBeDefined();
      return;
    }
    await pool.query('GRANT SELECT ON TABLE proxy_rate_limit TO web_readonly');
    const before = await pool.query<{ allowed: boolean }>(
      "select has_table_privilege('web_readonly', 'proxy_rate_limit', 'SELECT') as allowed"
    );
    expect(before.rows[0]?.allowed).toBe(true);

    await pool.query(revokeBlock());

    const after = await pool.query<{ allowed: boolean }>(
      "select has_table_privilege('web_readonly', 'proxy_rate_limit', 'SELECT') as allowed"
    );
    expect(after.rows[0]?.allowed).toBe(false);
  });
});

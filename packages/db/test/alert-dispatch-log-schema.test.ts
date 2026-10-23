// ROADMAP 3.4 (decisión 259, D17; migración 0022) — la tabla de deduplicación duradera de los avisos y su
// REVOKE condicional a los dos roles web. Se prueba contra PostgreSQL real con SQL plano.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

const MIGRATION_PATH = fileURLToPath(new URL('../migrations/0022_alert_dispatch_log.sql', import.meta.url));
const JOURNAL_PATH = fileURLToPath(new URL('../migrations/meta/_journal.json', import.meta.url));

function revokeBlock(): string {
  const statements = readFileSync(MIGRATION_PATH, 'utf8').split('--> statement-breakpoint');
  const block = statements.find((statement) => /REVOKE ALL ON TABLE alert_dispatch_log/.test(statement));
  if (block === undefined) {
    throw new Error('La migración 0022 no contiene el bloque REVOKE sobre alert_dispatch_log');
  }
  return block;
}

describeWithDb('alert_dispatch_log — esquema y REVOKE (decisión 259, migración 0022)', () => {
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

  it('crea dedup_key (clave primaria) y last_sent_at con zona horaria, ambas NOT NULL', async () => {
    const columns = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'alert_dispatch_log' order by ordinal_position`
    );
    expect(columns.rows).toEqual([
      { column_name: 'dedup_key', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'last_sent_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ]);
    const pk = await pool.query<{ column_name: string }>(
      `select a.attname as column_name from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = 'alert_dispatch_log'::regclass and i.indisprimary`
    );
    expect(pk.rows).toEqual([{ column_name: 'dedup_key' }]);
  });

  it('tiene un índice sobre last_sent_at (la purga acotada no recorre la tabla entera)', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'alert_dispatch_log' and indexname <> 'alert_dispatch_log_pkey'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('(last_sent_at)');
  });

  it('la migración es aditiva: solo crea alert_dispatch_log y revoca sobre ella', () => {
    const sqlText = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sqlText).toMatch(/create table "alert_dispatch_log"/i);
    expect(sqlText).not.toMatch(/\bdrop\s+(table|column|index)\b/i);
    expect(sqlText).not.toMatch(/\balter\s+table\b/i);
  });

  it('el diario de migraciones registra la 0022 con su nombre', () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.at(-1)).toMatchObject({ idx: 22, tag: '0022_alert_dispatch_log' });
  });

  it('el REVOKE condicional cubre a web_readonly Y a web_coverage y no falla si faltan los roles', async () => {
    const text = revokeBlock();
    expect(text).toMatch(/REVOKE ALL ON TABLE alert_dispatch_log FROM web_readonly;/);
    expect(text).toMatch(/REVOKE ALL ON TABLE alert_dispatch_log FROM web_coverage;/);
    expect(text).toMatch(/pg_roles/);
    const roles = await pool.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname in ('web_readonly', 'web_coverage')"
    );
    if (roles.rowCount === 0) {
      await expect(pool.query(text)).resolves.toBeDefined();
      return;
    }
    for (const role of roles.rows) {
      await pool.query(`GRANT SELECT ON TABLE alert_dispatch_log TO ${role.rolname}`);
    }
    await pool.query(text);
    for (const role of roles.rows) {
      const { rows } = await pool.query<{ allowed: boolean }>(
        "select has_table_privilege($1, 'alert_dispatch_log', 'SELECT') as allowed",
        [role.rolname]
      );
      expect(rows[0]?.allowed).toBe(false);
    }
  });
});

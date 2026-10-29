// ROADMAP 3.4 (decisión 257, D9; R5.1) — migraciones aplicadas por programa sobre la URL directa, sin
// drizzle-kit en tiempo de ejecución. Mismo registro (`drizzle.__drizzle_migrations`) que usa el
// `drizzle-kit migrate` de desarrollo, así que ambos caminos son intercambiables sobre una misma base.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrate.js';
import { createScratchDatabase } from '../helpers/scratch-database.js';
import type { ScratchDatabase } from '../helpers/scratch-database.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

const JOURNAL_PATH = fileURLToPath(new URL('../../migrations/meta/_journal.json', import.meta.url));
const MIGRATE_SOURCE = fileURLToPath(new URL('../../src/migrate.ts', import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url));

function journalEntryCount(): number {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

describeWithTestDb('runMigrations — base vacía y segunda ejecución (decisión 257, D9)', (testUrl) => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createScratchDatabase(testUrl, 'mig');
  });

  afterAll(async () => {
    await scratch.drop();
  });

  it('aplica todas las migraciones sobre una base vacía y la segunda ejecución no aplica ninguna', async () => {
    const { db, pool } = createDb(scratch.url);
    try {
      const expected = journalEntryCount();
      expect(expected).toBeGreaterThan(20);

      const first = await runMigrations(db);
      expect(first).toEqual({ applied: expected });

      const { rows: journal } = await pool.query<{ count: string }>(
        'select count(*) from drizzle.__drizzle_migrations'
      );
      expect(Number(journal[0]?.count)).toBe(expected);
      const { rows: tables } = await pool.query<{ name: string | null }>(
        `select to_regclass('public.proxy_rate_limit')::text as name`
      );
      expect(tables[0]?.name).toBe('proxy_rate_limit');

      const second = await runMigrations(db);
      expect(second).toEqual({ applied: 0 });
    } finally {
      await pool.end();
    }
  });

  it('completa una base a medias: solo aplica las migraciones que faltan', async () => {
    const partial = await createScratchDatabase(testUrl, 'migpart');
    const { db, pool } = createDb(partial.url);
    try {
      await runMigrations(db);
      // Simula una base migrada hasta la penúltima: el registro pierde su última fila y se deshace su efecto
      // (la última migración es la 0022, `alert_dispatch_log`; al añadir otra, actualizar esta pareja).
      await pool.query(
        'delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations)'
      );
      await pool.query('drop table alert_dispatch_log');

      const resumed = await runMigrations(db);

      expect(resumed).toEqual({ applied: 1 });
      const { rows } = await pool.query<{ name: string | null }>(
        `select to_regclass('public.alert_dispatch_log')::text as name`
      );
      expect(rows[0]?.name).toBe('alert_dispatch_log');
    } finally {
      await pool.end();
      await partial.drop();
    }
  });
});

describe('runMigrations — sin drizzle-kit y empaquetado (decisión 257, D13)', () => {
  it('el módulo no importa drizzle-kit (solo el migrador de drizzle-orm)', () => {
    const source = readFileSync(MIGRATE_SOURCE, 'utf8');

    expect(source).toContain('drizzle-orm/node-postgres/migrator');
    expect(source).not.toMatch(/from\s+['"]drizzle-kit/);
  });

  it('el paquete publica `migrations` y `sql` además de `dist` (la imagen de despliegue los necesita)', () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { files: string[] };

    expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'migrations', 'sql']));
  });
});

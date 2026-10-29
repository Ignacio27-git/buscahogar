// ROADMAP 3.3 (prescan-top-cities, PR2; decisión 250) — migración 0018: los jobs de
// cobertura pasan a ser POR OPERACIÓN. Contra PostgreSQL real.
//
// - R9/S9.1/S9.2: unicidad por (zona, fuente, operación), con AMBOS índices únicos
//   (el total y el parcial pending/running) incluyendo la operación.
// - R10/S10.1/S10.2: los jobs existentes reciben `operation = 'rent'` (solo se ha
//   barrido `rent`) sin perder fila ni cursor.
// - R11/S11.2: las zonas ya cubiertas rellenan `last_completed_at` desde
//   `zones.last_swept_at`.
import { readdirSync, readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertLocation } from '../helpers/fixtures.js';

const migrationsDir = new URL('../../migrations/', import.meta.url);

// Sentencias de backfill de la migración 0018 (las `UPDATE`), leídas del propio
// fichero SQL para que el test ejercite el SQL que realmente se aplica.
function readBackfillStatements(): string[] {
  const file = readdirSync(migrationsDir).find((name) => name.startsWith('0018_'));
  if (!file) {
    throw new Error('No existe la migración 0018');
  }
  const statements = readFileSync(new URL(file, migrationsDir), 'utf8')
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => /^UPDATE\s/i.test(part));
  if (statements.length === 0) {
    throw new Error('La migración 0018 no contiene ningún backfill');
  }
  return statements;
}

interface JobRow {
  operation: string | null;
  cursor: string | null;
  last_completed_at: Date | null;
}

describeWithDb('migración 0018 — coverage_jobs por operación', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  async function insertSource(key: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO sources (key, name, kind) VALUES ($1, $1, 'api') RETURNING id`,
      [key]
    );
    const row = rows[0];
    if (!row) {
      throw new Error('No se pudo insertar la fuente');
    }
    return row.id;
  }

  async function insertZone(state = 'uncovered', lastSweptAt: string | null = null): Promise<string> {
    const locationId = await insertLocation(db);
    const [zone] = await db.insert(zones).values({ locationId, state }).returning({ id: zones.id });
    if (!zone) {
      throw new Error('No se pudo insertar la zona');
    }
    if (lastSweptAt !== null) {
      await pool.query('UPDATE zones SET last_swept_at = $2 WHERE id = $1', [zone.id, lastSweptAt]);
    }
    return zone.id;
  }

  describe('esquema', () => {
    it('operation es NOT NULL, sin valor por defecto, y last_completed_at / presweep_requested_at existen y admiten NULL', async () => {
      const { rows } = await pool.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'coverage_jobs'
            AND column_name IN ('operation', 'last_completed_at', 'presweep_requested_at')
          ORDER BY column_name`
      );
      expect(rows).toEqual([
        { column_name: 'last_completed_at', is_nullable: 'YES', column_default: null },
        { column_name: 'operation', is_nullable: 'NO', column_default: null },
        { column_name: 'presweep_requested_at', is_nullable: 'YES', column_default: null },
      ]);
    });

    it('rechaza una operación fuera de sale/rent (CHECK, 23514) y una fila sin operación (23502)', async () => {
      const zoneId = await insertZone();
      const sourceId = await insertSource('op-check');

      await expect(
        pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, operation) VALUES ($1, $2, 'lease')`, [
          zoneId,
          sourceId,
        ])
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(`INSERT INTO coverage_jobs (zone_id, source_id) VALUES ($1, $2)`, [zoneId, sourceId])
      ).rejects.toMatchObject({ code: '23502' });
    });
  });

  describe('índices únicos por operación (S9.1, S9.2)', () => {
    it('los dos índices nuevos incluyen la operación y los dos antiguos ya no existen', async () => {
      const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'coverage_jobs' ORDER BY indexname`
      );
      const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));

      expect(byName.has('coverage_jobs_zone_source_idx')).toBe(false);
      expect(byName.has('coverage_jobs_zone_source_pending_idx')).toBe(false);

      const total = byName.get('coverage_jobs_zone_source_op_idx');
      expect(total).toMatch(/UNIQUE INDEX/);
      expect(total).toMatch(/\(zone_id, source_id, operation\)/);
      expect(total).not.toMatch(/WHERE/);

      const pending = byName.get('coverage_jobs_zone_source_op_pending_idx');
      expect(pending).toMatch(/UNIQUE INDEX/);
      expect(pending).toMatch(/\(zone_id, source_id, operation\)/);
      expect(pending).toMatch(/WHERE .*status.*pending.*running/s);
    });

    it('un job pending de rent y otro pending de sale para la misma zona y fuente persisten a la vez', async () => {
      const zoneId = await insertZone();
      const sourceId = await insertSource('op-pair');

      await pool.query(
        `INSERT INTO coverage_jobs (zone_id, source_id, status, operation, cursor) VALUES ($1, $2, 'pending', 'rent', 'rent-cursor')`,
        [zoneId, sourceId]
      );
      await pool.query(
        `INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'pending', 'sale')`,
        [zoneId, sourceId]
      );

      const { rows } = await pool.query<{ operation: string; cursor: string | null }>(
        `SELECT operation, cursor FROM coverage_jobs WHERE zone_id = $1 ORDER BY operation`,
        [zoneId]
      );
      // El job de rent queda intacto (S9.1).
      expect(rows).toEqual([
        { operation: 'rent', cursor: 'rent-cursor' },
        { operation: 'sale', cursor: null },
      ]);
    });

    it('una segunda fila para el mismo (zona, fuente, operación) se rechaza, sea cual sea el estado de la primera', async () => {
      const zoneId = await insertZone();
      const sourceId = await insertSource('op-dup');

      await pool.query(
        `INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'failed', 'sale')`,
        [zoneId, sourceId]
      );
      await expect(
        pool.query(
          `INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'pending', 'sale')`,
          [zoneId, sourceId]
        )
      ).rejects.toMatchObject({ code: '23505' });

      await pool.query(
        `INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'pending', 'rent')`,
        [zoneId, sourceId]
      );
      await expect(
        pool.query(
          `INSERT INTO coverage_jobs (zone_id, source_id, status, operation) VALUES ($1, $2, 'running', 'rent')`,
          [zoneId, sourceId]
        )
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('INSERT … ON CONFLICT DO NOTHING sin target deja exactamente una fila por (zona, fuente, operación)', async () => {
      const zoneId = await insertZone();
      const sourceId = await insertSource('op-conflict');
      const insert = `INSERT INTO coverage_jobs (zone_id, source_id, status, operation)
                      VALUES ($1, $2, 'pending', $3) ON CONFLICT DO NOTHING`;

      await Promise.all([
        pool.query(insert, [zoneId, sourceId, 'sale']),
        pool.query(insert, [zoneId, sourceId, 'rent']),
        pool.query(insert, [zoneId, sourceId, 'sale']),
      ]);

      const { rows } = await pool.query<{ operation: string }>(
        `SELECT operation FROM coverage_jobs WHERE zone_id = $1 ORDER BY operation`,
        [zoneId]
      );
      expect(rows).toEqual([{ operation: 'rent' }, { operation: 'sale' }]);
    });
  });

  describe('backfill sobre filas heredadas (S10.1, S10.2, S11.2)', () => {
    // Reproduce el estado ANTERIOR a 0018 dentro de una transacción que se revierte:
    // se quita el NOT NULL de `operation`, se insertan filas heredadas sin operación
    // y se ejecutan las sentencias `UPDATE` reales de la migración.
    async function withLegacyRows(
      legacy: ReadonlyArray<{ zoneId: string; sourceId: string; status: string; cursor: string | null }>
    ): Promise<JobRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE coverage_jobs ALTER COLUMN operation DROP NOT NULL');
        for (const row of legacy) {
          await client.query(
            `INSERT INTO coverage_jobs (zone_id, source_id, status, cursor) VALUES ($1, $2, $3, $4)`,
            [row.zoneId, row.sourceId, row.status, row.cursor]
          );
        }
        for (const statement of readBackfillStatements()) {
          await client.query(statement);
        }
        const { rows } = await client.query<JobRow>(
          'SELECT operation, cursor, last_completed_at FROM coverage_jobs ORDER BY cursor NULLS LAST, status'
        );
        return rows;
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    it('todo job heredado, con cursor o sin él y en cualquier estado, queda como rent sin perder el cursor', async () => {
      const sourceId = await insertSource('legacy');
      const withCursor = await insertZone();
      const noCursor = await insertZone();
      const failed = await insertZone();

      const rows = await withLegacyRows([
        { zoneId: withCursor, sourceId, status: 'pending', cursor: 'v1:fingerprint:homes:7' },
        { zoneId: noCursor, sourceId, status: 'done', cursor: null },
        { zoneId: failed, sourceId, status: 'failed', cursor: 'v1:other:homes:2' },
      ]);

      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.operation)).toEqual(['rent', 'rent', 'rent']);
      expect(rows.map((row) => row.cursor)).toEqual(['v1:fingerprint:homes:7', 'v1:other:homes:2', null]);
    });

    it('una zona cubierta rellena last_completed_at con zones.last_swept_at; una no cubierta lo deja en NULL', async () => {
      const sourceId = await insertSource('legacy-covered');
      const covered = await insertZone('covered', '2026-03-01T10:00:00Z');
      const uncovered = await insertZone('uncovered');

      const rows = await withLegacyRows([
        { zoneId: covered, sourceId, status: 'done', cursor: 'covered-cursor' },
        { zoneId: uncovered, sourceId, status: 'failed', cursor: 'uncovered-cursor' },
      ]);

      const byCursor = new Map(rows.map((row) => [row.cursor, row]));
      expect(byCursor.get('covered-cursor')?.last_completed_at?.toISOString()).toBe('2026-03-01T10:00:00.000Z');
      expect(byCursor.get('uncovered-cursor')?.last_completed_at).toBeNull();
    });
  });
});

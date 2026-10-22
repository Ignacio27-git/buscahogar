// ROADMAP 3.4 (decisión 258, parte 2; D14b; migración 0021) — la columna `coverage_jobs.lease_renewed_at`
// (arrendamiento del job en curso) y su relleno de las filas existentes. Contra PostgreSQL real.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../src/db.js';
import { coverageJobs, zones } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';
import { insertLocation, insertSource } from './helpers/fixtures.js';

const MIGRATION_PATH = fileURLToPath(new URL('../migrations/0021_coverage_jobs_lease.sql', import.meta.url));

// Las sentencias de relleno de la migración (todo lo que no es el ALTER TABLE).
function backfillStatements(): string[] {
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) =>
      statement
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((statement) => /^UPDATE\b/i.test(statement));
}

describeWithDb('coverage_jobs.lease_renewed_at — esquema y relleno (decisión 258, migración 0021)', () => {
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

  async function insertJob(values: Partial<typeof coverageJobs.$inferInsert>): Promise<string> {
    const locationId = await insertLocation(db);
    const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
    const sourceId = await insertSource(db);
    const [job] = await db
      .insert(coverageJobs)
      .values({ zoneId: zone?.id ?? '', sourceId, operation: 'rent', ...values })
      .returning({ id: coverageJobs.id });
    return job?.id ?? '';
  }

  async function lease(jobId: string): Promise<Date | null> {
    const [row] = await db
      .select({ leaseRenewedAt: coverageJobs.leaseRenewedAt })
      .from(coverageJobs)
      .where(eq(coverageJobs.id, jobId));
    return row?.leaseRenewedAt ?? null;
  }

  it('la columna es timestamptz NULLABLE y una fila nueva la deja en NULL', async () => {
    const { rows } = await pool.query<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_name = 'coverage_jobs' and column_name = 'lease_renewed_at'`
    );
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }]);

    const jobId = await insertJob({ status: 'pending' });
    expect(await lease(jobId)).toBeNull();
  });

  it('la migración es aditiva: añade una columna y solo ejecuta UPDATE de relleno', () => {
    const sqlText = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sqlText).toMatch(/ADD COLUMN "lease_renewed_at" timestamp with time zone/i);
    expect(sqlText).not.toMatch(/\bdrop\s+(table|column|index)\b/i);
    expect(sqlText).not.toMatch(/\bnot null\b/i);
    expect(backfillStatements().length).toBeGreaterThan(0);
  });

  it('el relleno da a un job running su arrendamiento a "ahora" (margen completo tras desplegar)', async () => {
    const jobId = await insertJob({ status: 'running', startedAt: new Date('2026-01-01T00:00:00Z') });

    for (const statement of backfillStatements()) {
      await pool.query(statement);
    }

    const renewed = await lease(jobId);
    expect(renewed).not.toBeNull();
    expect(Math.abs((renewed?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  it('el relleno deja en los demás jobs su última actividad conocida (fin, o inicio) y NULL si nunca se intentaron', async () => {
    const finished = await insertJob({
      status: 'done',
      startedAt: new Date('2026-02-01T10:00:00Z'),
      finishedAt: new Date('2026-02-01T10:05:00Z'),
    });
    const startedOnly = await insertJob({ status: 'pending', startedAt: new Date('2026-03-01T10:00:00Z') });
    const never = await insertJob({ status: 'pending' });

    for (const statement of backfillStatements()) {
      await pool.query(statement);
    }

    expect(await lease(finished)).toEqual(new Date('2026-02-01T10:05:00Z'));
    expect(await lease(startedOnly)).toEqual(new Date('2026-03-01T10:00:00Z'));
    expect(await lease(never)).toBeNull();
  });
});

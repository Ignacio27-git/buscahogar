// ROADMAP 1.13 (diseño DD-16, arbitraje CR-3) — el índice único PARCIAL de
// `coverage_jobs` (`coverage_jobs_zone_source_pending_idx`, WHERE status IN
// ('pending','running')) no cubre `status = 'failed'`. Un barrido fallido
// deja `zones.state = 'uncovered'`, así que una nueva petición para la misma
// zona no encuentra conflicto contra ese índice parcial y crea una SEGUNDA
// fila para el mismo (zone_id, source_id) — `claimJob` selecciona sin
// `ORDER BY`/`LIMIT`, así que cuál de las dos reclama es no determinista.
// `coverage_jobs_zone_source_idx` (índice único TOTAL, sin WHERE) cierra ese
// hueco a nivel de base de datos, sea cual sea el estado de la fila
// existente.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertLocation } from '../helpers/fixtures.js';
import type { Database } from '../../src/db.js';

describeWithDb('coverage_jobs_zone_source_idx — índice único total (DD-16, CR-3)', () => {
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

  it('rechaza una segunda fila para el mismo (zone_id, source_id) cuando la primera está en estado "failed" — el índice parcial la dejaba pasar', async () => {
    const locationId = await insertLocation(db);
    const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
    const sourceResult = await pool.query<{ id: string }>(
      `INSERT INTO sources (key, name, kind) VALUES ($1, $2, $3) RETURNING id`,
      ['coverage-source', 'Fuente de cobertura', 'api']
    );
    const source = sourceResult.rows[0];
    if (!zone || !source) {
      throw new Error('No se pudieron insertar los datos de partida');
    }

    await pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status) VALUES ($1, $2, 'failed')`, [
      zone.id,
      source.id,
    ]);

    await expect(
      pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status) VALUES ($1, $2, 'pending')`, [
        zone.id,
        source.id,
      ])
    ).rejects.toMatchObject({ code: '23505' }); // unique_violation
  });

  it('sigue rechazando un segundo "pending" para la misma zona/fuente (comportamiento ya cubierto por el índice parcial, no debe regresionar)', async () => {
    const locationId = await insertLocation(db);
    const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
    const sourceResult = await pool.query<{ id: string }>(
      `INSERT INTO sources (key, name, kind) VALUES ($1, $2, $3) RETURNING id`,
      ['coverage-source-2', 'Fuente de cobertura 2', 'api']
    );
    const source = sourceResult.rows[0];
    if (!zone || !source) {
      throw new Error('No se pudieron insertar los datos de partida');
    }

    await pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status) VALUES ($1, $2, 'pending')`, [
      zone.id,
      source.id,
    ]);

    await expect(
      pool.query(`INSERT INTO coverage_jobs (zone_id, source_id, status) VALUES ($1, $2, 'pending')`, [
        zone.id,
        source.id,
      ])
    ).rejects.toMatchObject({ code: '23505' });
  });
});

// REQ-SCHEMA-08, REQ-SCHEMA-09: la cola de barridos solo admite los estados
// declarados, y el estado de una zona (para no repetir un barrido ya hecho)
// se lee de vuelta sin cambios.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertLocation } from '../helpers/fixtures.js';

describeWithDb('coverage_jobs y zones: estado de barrido', () => {
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

  it('rechaza un status fuera del conjunto declarado (REQ-SCHEMA-09)', async () => {
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

    // Se inserta con SQL crudo, no con el `insert` tipado: `status` es un
    // `pgEnum`, así que TypeScript ya impide pasar 'queued' en tiempo de
    // compilación. Aquí se comprueba que, además, la BASE DE DATOS lo
    // rechaza — la garantía real no depende de que la capa de aplicación se
    // porte bien.
    await expect(
      pool.query(
        `INSERT INTO coverage_jobs (zone_id, source_id, operation, status) VALUES ($1, $2, 'rent', 'queued')`,
        [zone.id, source.id]
      )
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('el estado de una zona se lee de vuelta sin cambios por su identificador canónico (REQ-SCHEMA-08)', async () => {
    const locationId = await insertLocation(db);
    const lastSweptAt = new Date('2026-03-15T10:00:00Z');

    const [inserted] = await db
      .insert(zones)
      .values({ locationId, state: 'covered', lastSweptAt })
      .returning();
    if (!inserted) {
      throw new Error('No se pudo insertar la zona de prueba');
    }

    const [readBack] = await db.select().from(zones).where(eq(zones.id, inserted.id));

    expect(readBack?.state).toBe('covered');
    expect(readBack?.lastSweptAt?.toISOString()).toBe(lastSweptAt.toISOString());
    expect(readBack?.locationId).toBe(locationId);
  });
});

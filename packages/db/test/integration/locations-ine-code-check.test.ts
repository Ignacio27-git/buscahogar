// ROADMAP 1.13 (diseño DD-1, R4) — `locations.ine_code` no tenía límite de
// longitud: un código de 6 dígitos insertaba sin fallar y después nunca
// coincidía con la búsqueda de 5 dígitos de `resolveZoneByIneCode`
// (`apps/ingestion/src/sweep/reference-store.ts:43`) — un fallo total y
// silencioso para esa zona. El CHECK `locations_ine_code_check` lo hace
// imposible a nivel de base de datos.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';

describeWithDb('locations_ine_code_check (DD-1, R4)', () => {
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

  it('rechaza un ine_code de 6 dígitos (R4: nunca debe coincidir en silencio con la búsqueda de 5 dígitos)', async () => {
    await expect(
      pool.query(
        `INSERT INTO locations (ine_code, municipality, province, province_code, autonomous_community, search_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['180871', 'Municipio inválido', 'Granada', '18', 'Andalucía', 'municipio invalido']
      )
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });

  it('rechaza un ine_code con caracteres no numéricos', async () => {
    await expect(
      pool.query(
        `INSERT INTO locations (ine_code, municipality, province, province_code, autonomous_community, search_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['1808A', 'Municipio inválido', 'Granada', '18', 'Andalucía', 'municipio invalido']
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('acepta un ine_code de exactamente 5 dígitos', async () => {
    const { rows } = await pool.query<{ ine_code: string }>(
      `INSERT INTO locations (ine_code, municipality, province, province_code, autonomous_community, search_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ine_code`,
      ['18087', 'Granada', 'Granada', '18', 'Andalucía', 'granada']
    );

    expect(rows[0]?.ine_code).toBe('18087');
  });
});

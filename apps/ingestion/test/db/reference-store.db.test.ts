// Paso 1.7 — reference-store.ts (diseño D5 paso 1, D9; PERSIST-9). Contra
// PostgreSQL real: sin describeWithDb (D2, resuelve D-a) — la config de esta
// suite ya garantiza DATABASE_URL presente, así que un `describe` normal
// basta; omitir en silencio ya es estructuralmente imposible.
import { listings, locations } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  resolveSourceUuid,
  resolveZoneByIneCode,
  UnknownSourceError,
  UnknownZoneError,
} from '../../src/sweep/reference-store.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource } from './helpers/seed-fixtures.js';

describe('reference-store — PERSIST-9, D9: resolución de referencia sin creación implícita', () => {
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

  it('PERSIST-9a: sources.key ausente aborta con error nombrado, sin escribir ningún listing', async () => {
    await expect(resolveSourceUuid(db, 'idealista')).rejects.toThrow(UnknownSourceError);
    await expect(resolveSourceUuid(db, 'idealista')).rejects.toThrow(/idealista/);

    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(0);
  });

  it('resuelve sources.key existente a su uuid', async () => {
    const sourceId = await insertSource(db);
    await expect(resolveSourceUuid(db, 'idealista')).resolves.toBe(sourceId);
  });

  it('--zone/ine_code desconocido reporta ejecutar pnpm db:seed y no crea nada', async () => {
    await expect(resolveZoneByIneCode(db, '99999')).rejects.toThrow(UnknownZoneError);
    await expect(resolveZoneByIneCode(db, '99999')).rejects.toThrow(/pnpm db:seed/);

    const rows = await db.select().from(locations);
    expect(rows).toHaveLength(0);
  });

  it('resuelve un ine_code existente a la zona ligada a esa localización', async () => {
    const { zoneId } = await insertLocationWithZone(db, { ineCode: '18087' });
    await expect(resolveZoneByIneCode(db, '18087')).resolves.toBe(zoneId);
  });
});

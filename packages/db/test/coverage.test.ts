// ROADMAP 1.13 Unit D (diseño §5 interfaces addendum, DD-14, DD-16 lado web)
// — capa de registro/consulta de `coverage_jobs` para `apps/web`. Zod-free
// (decisión 023): `registerCoverageJob`/`getCoverageJobState` reciben ya un
// `zoneId`/`sourceId` resueltos, nunca validan entrada externa por sí
// mismas — esa validación vive en `packages/core` (decisión 057).
//
// Conexión de prueba: el owner de la base de datos (`DATABASE_URL`), igual
// que el resto de la suite de integración de este paquete
// (`budget-ledger.test.ts`, `locations-query.test.ts`) — la comprobación del
// rol INSERT-only RESTRINGIDO que usará producción vive aparte, en
// `apps/web/test/db/coverage-role-privileges.test.ts` (tarea 10.6, gateada
// en `WEB_COVERAGE_DATABASE_URL`, todavía sin provisionar — R3).
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../src/db.js';
import {
  countZonesOpenedToday,
  getCoverageJobState,
  registerCoverageJob,
  resolveSourceUuidByKey,
} from '../src/coverage.js';
import { geographyPointWkt } from '../src/spatial.js';
import { locations, sources, zones } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertSourceWithKey(db: Database, key: string): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key, name: `Fuente ${key}`, kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

async function insertZone(
  db: Database,
  overrides: { readonly centroid?: { readonly latitude: number; readonly longitude: number } } = {}
): Promise<string> {
  const ineCode = String(Math.floor(10_000 + Math.random() * 89_999));
  const [location] = await db
    .insert(locations)
    .values({
      ineCode,
      municipality: 'Granada',
      province: 'Granada',
      provinceCode: '18',
      autonomousCommunity: 'Andalucía',
      searchName: 'granada',
      centroid: overrides.centroid ? geographyPointWkt(overrides.centroid) : null,
      sweepRadiusM: overrides.centroid ? 4500 : null,
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  const [zone] = await db.insert(zones).values({ locationId: location.id }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

describeWithDb('registerCoverageJob (DD-16 lado web) — idempotente por el índice único total', () => {
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

  it('inserta status=pending y cursor=NULL', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);

    await registerCoverageJob(db, zoneId, sourceId, 'rent');

    const job = await getCoverageJobState(db, zoneId, sourceId, 'rent');
    expect(job?.status).toBe('pending');
  });

  it('ON CONFLICT DO NOTHING sin target: una segunda llamada para la misma (zone, source) es un éxito silencioso, nunca lanza', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);

    await registerCoverageJob(db, zoneId, sourceId, 'rent');
    await expect(registerCoverageJob(db, zoneId, sourceId, 'rent')).resolves.toBeUndefined();
  });

  it('dos registros concurrentes para la misma zona producen EXACTAMENTE una fila pending', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);

    await Promise.all([registerCoverageJob(db, zoneId, sourceId, 'rent'), registerCoverageJob(db, zoneId, sourceId, 'rent')]);

    const rows = await db.select().from(zones); // sanity: la zona sigue siendo una sola fila
    expect(rows).toHaveLength(1);
    const job = await getCoverageJobState(db, zoneId, sourceId, 'rent');
    expect(job?.status).toBe('pending');
  });

  // ROADMAP 3.3 (decisión 250; S9.1, S9.2): la operación forma parte de la clave.
  it('un job de sale y otro de rent para la misma zona se registran a la vez y se leen cada uno por su operación', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);

    await Promise.all([
      registerCoverageJob(db, zoneId, sourceId, 'sale'),
      registerCoverageJob(db, zoneId, sourceId, 'rent'),
      registerCoverageJob(db, zoneId, sourceId, 'sale'),
    ]);

    const { rows } = await pool.query<{ operation: string }>(
      'select operation from coverage_jobs where zone_id = $1 order by operation',
      [zoneId]
    );
    expect(rows).toEqual([{ operation: 'rent' }, { operation: 'sale' }]);
    expect((await getCoverageJobState(db, zoneId, sourceId, 'sale'))?.status).toBe('pending');
    expect((await getCoverageJobState(db, zoneId, sourceId, 'rent'))?.status).toBe('pending');
  });

  it('getCoverageJobState no devuelve el job de la otra operación', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);
    await registerCoverageJob(db, zoneId, sourceId, 'rent');

    expect(await getCoverageJobState(db, zoneId, sourceId, 'sale')).toBeNull();
  });
});

describeWithDb('countZonesOpenedToday (DD-14) — deriva de coverage_jobs.requested_at, nunca de zones.createdAt', () => {
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

  it('un día de importación masiva (muchas filas zones con el mismo createdAt) no cuenta como "zonas nuevas" salvo que se registren de verdad', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    // Simula una importación masiva: 5 zonas creadas, CERO registradas para cobertura.
    await Promise.all(Array.from({ length: 5 }, () => insertZone(db)));

    expect(await countZonesOpenedToday(db)).toBe(0);

    const zoneId = await insertZone(db);
    await registerCoverageJob(db, zoneId, sourceId, 'rent');

    expect(await countZonesOpenedToday(db)).toBe(1);
  });

  it('dos zonas distintas registradas hoy cuentan como 2', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneA = await insertZone(db);
    const zoneB = await insertZone(db);

    await registerCoverageJob(db, zoneA, sourceId, 'rent');
    await registerCoverageJob(db, zoneB, sourceId, 'rent');

    expect(await countZonesOpenedToday(db)).toBe(2);
  });
});

describeWithDb('getCoverageJobState (§5 interfaces) — estado legible del rol de solo lectura', () => {
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

  it('devuelve status/attempts/requestedAt/startedAt/error para un job conocido', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);
    await registerCoverageJob(db, zoneId, sourceId, 'rent');

    const job = await getCoverageJobState(db, zoneId, sourceId, 'rent');
    expect(job).toMatchObject({ status: 'pending', attempts: 0, startedAt: null, error: null });
    expect(job?.requestedAt).toBeInstanceOf(Date);
  });

  it('devuelve null para una combinación (zone, source) sin ningún job', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    const zoneId = await insertZone(db);

    expect(await getCoverageJobState(db, zoneId, sourceId, 'rent')).toBeNull();
  });
});

describeWithDb('resolveSourceUuidByKey — lectura de sources.key -> id (apps/web no puede importar apps/ingestion)', () => {
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

  it('resuelve una key conocida a su uuid real', async () => {
    const sourceId = await insertSourceWithKey(db, 'idealista');
    expect(await resolveSourceUuidByKey(db, 'idealista')).toBe(sourceId);
  });

  it('una key desconocida devuelve null, nunca lanza', async () => {
    expect(await resolveSourceUuidByKey(db, `no-existe-${randomUUID()}`)).toBeNull();
  });
});

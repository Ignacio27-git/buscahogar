// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102) — pruebas
// NEGATIVAS de privilegios sobre `zone_query_signals` con los roles reales:
// `web_coverage` solo puede INSERT (incluido el duplicado con `ON CONFLICT DO
// NOTHING`), y el conjunto EXACTO de sus GRANT sobre `public` es el de las
// decisiones 064/076/102. `web_readonly` nunca escribe.
//
// Gateadas en `WEB_COVERAGE_DATABASE_URL` / `WEB_DATABASE_URL`: omitidas, no
// fallidas, si el mantenedor no las ha provisionado. Requieren la migración
// 0013 y una nueva ejecución de `bootstrap-roles-grants.sql` (tarea del
// propietario). Sembrado con el owner; la conexión bajo prueba es SIEMPRE el
// rol restringido.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { locations, zones } from '@buscahogar/db';

import { describeWithCoverageDb } from '../helpers/coverage-db-gate.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithReadonlyDb } from '../helpers/readonly-db-gate.js';

type Pool = import('../helpers/db-client.js').TestDbHandle['pool'];

async function seedZone(db: Database): Promise<string> {
  const [location] = await db
    .insert(locations)
    .values({
      ineCode: '18099',
      municipality: 'Granada',
      province: 'Granada',
      provinceCode: '18',
      autonomousCommunity: 'Andalucía',
      searchName: 'granada',
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo sembrar la location de prueba');
  }
  const [zone] = await db.insert(zones).values({ locationId: location.id }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo sembrar la zona de prueba');
  }
  return zone.id;
}

describeWithCoverageDb('web_coverage sobre zone_query_signals — solo INSERT (S-QSR-4, decisión 102)', () => {
  let ownerDb: Database;
  let ownerPool: Pool;
  let coveragePool: Pool;

  beforeAll(() => {
    ({ db: ownerDb, pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- describeWithCoverageDb ya garantiza que la variable existe
    ({ pool: coveragePool } = createDb(process.env.WEB_COVERAGE_DATABASE_URL!));
  });

  afterAll(async () => {
    await ownerPool.end();
    await coveragePool.end();
  });

  beforeEach(async () => {
    await truncateAll(ownerPool);
  });

  afterEach(async () => {
    await truncateAll(ownerPool);
  });

  it('INSERT de (zone_id) SÍ está permitido, y el duplicado con ON CONFLICT DO NOTHING también', async () => {
    const zoneId = await seedZone(ownerDb);

    await expect(
      coveragePool.query('insert into zone_query_signals (zone_id) values ($1) on conflict do nothing', [zoneId])
    ).resolves.toBeDefined();
    await expect(
      coveragePool.query('insert into zone_query_signals (zone_id) values ($1) on conflict do nothing', [zoneId])
    ).resolves.toBeDefined();

    const { rows } = await ownerPool.query<{ count: string }>('select count(*)::text as count from zone_query_signals');
    expect(rows[0]?.count).toBe('1');
  });

  it('SELECT en zone_query_signals está RECHAZADO', async () => {
    await expect(coveragePool.query('select * from zone_query_signals limit 1')).rejects.toMatchObject({
      code: '42501', // insufficient_privilege
    });
  });

  it('UPDATE en zone_query_signals está RECHAZADO', async () => {
    const zoneId = await seedZone(ownerDb);
    await ownerPool.query('insert into zone_query_signals (zone_id) values ($1)', [zoneId]);

    await expect(coveragePool.query("update zone_query_signals set day = '2020-01-01'")).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('DELETE en zone_query_signals está RECHAZADO', async () => {
    const zoneId = await seedZone(ownerDb);
    await ownerPool.query('insert into zone_query_signals (zone_id) values ($1)', [zoneId]);

    await expect(coveragePool.query('delete from zone_query_signals')).rejects.toMatchObject({ code: '42501' });
  });

  it('TRUNCATE en zone_query_signals está RECHAZADO', async () => {
    await expect(coveragePool.query('truncate table zone_query_signals')).rejects.toMatchObject({ code: '42501' });
  });
});

describeWithCoverageDb('web_coverage — conjunto EXACTO de GRANT sobre tablas (S-QSR-5, decisiones 064/076/102/255)', () => {
  let ownerPool: Pool;
  let coveragePool: Pool;

  beforeAll(() => {
    ({ pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- describeWithCoverageDb ya garantiza que la variable existe
    ({ pool: coveragePool } = createDb(process.env.WEB_COVERAGE_DATABASE_URL!));
  });

  afterAll(async () => {
    await ownerPool.end();
    await coveragePool.end();
  });

  it('el catálogo information_schema.role_table_grants muestra exactamente esos privilegios y ningún otro', async () => {
    const { rows } = await ownerPool.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'web_coverage' and table_schema = 'public'
       order by table_name, privilege_type`
    );

    expect(rows.map((row) => `${row.table_name}:${row.privilege_type}`)).toEqual([
      'coverage_client_quota:DELETE',
      'coverage_client_quota:INSERT',
      'coverage_client_quota:SELECT',
      'coverage_client_quota:UPDATE',
      'coverage_jobs:INSERT',
      // ROADMAP 3.4 (decisión 255, PD8): único GRANT nuevo del paso, el limitador de peticiones compartido.
      'proxy_rate_limit:DELETE',
      'proxy_rate_limit:INSERT',
      'proxy_rate_limit:SELECT',
      'proxy_rate_limit:UPDATE',
      'zone_query_signals:INSERT',
    ]);
  });

  // Las columnas son las reales de cada tabla: el rechazo por privilegio
  // ocurre tras resolver los nombres, así que una columna inexistente daría
  // 42703 y no probaría nada sobre los GRANT.
  it.each([
    ['listings', `insert into listings (source_id, external_id, url) values ('${randomUUID()}', 'x', 'https://example.test/x')`],
    [
      'listing_versions',
      `insert into listing_versions (listing_id, version, price_cents, operation) values ('${randomUUID()}', 1, 1, 'sale')`,
    ],
    ['properties', 'insert into properties (listing_count) values (1)'],
    [
      'property_listings',
      `insert into property_listings (property_id, listing_id, score, strategy_name, strategy_version, signals) values ('${randomUUID()}', '${randomUUID()}', 1, 'x', '1', '{}'::jsonb)`,
    ],
    ['zones', `insert into zones (location_id) values ('${randomUUID()}')`],
  ])('una escritura en %s está RECHAZADA con insufficient_privilege', async (_table, statement) => {
    await expect(coveragePool.query(statement)).rejects.toMatchObject({ code: '42501' });
  });
});

describeWithReadonlyDb('web_readonly sobre zone_query_signals — nunca escribe (S-QSR-6, decisión 102)', () => {
  let ownerDb: Database;
  let ownerPool: Pool;
  let readonlyPool: Pool;

  beforeAll(() => {
    ({ db: ownerDb, pool: ownerPool } = connectTestDb());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- describeWithReadonlyDb ya garantiza que la variable existe
    ({ pool: readonlyPool } = createDb(process.env.WEB_DATABASE_URL!));
  });

  afterAll(async () => {
    await ownerPool.end();
    await readonlyPool.end();
  });

  beforeEach(async () => {
    await truncateAll(ownerPool);
  });

  afterEach(async () => {
    await truncateAll(ownerPool);
  });

  it('SELECT puede tener éxito (privilegios por defecto) — inocuo, la web no lo usa', async () => {
    await expect(readonlyPool.query('select * from zone_query_signals limit 1')).resolves.toBeDefined();
  });

  it('INSERT en zone_query_signals está RECHAZADO', async () => {
    await expect(
      readonlyPool.query('insert into zone_query_signals (zone_id) values ($1)', [randomUUID()])
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('UPDATE y DELETE en zone_query_signals están RECHAZADOS', async () => {
    const zoneId = await seedZone(ownerDb);
    await ownerPool.query('insert into zone_query_signals (zone_id) values ($1)', [zoneId]);

    await expect(readonlyPool.query("update zone_query_signals set day = '2020-01-01'")).rejects.toMatchObject({
      code: '42501',
    });
    await expect(readonlyPool.query('delete from zone_query_signals')).rejects.toMatchObject({ code: '42501' });
  });
});

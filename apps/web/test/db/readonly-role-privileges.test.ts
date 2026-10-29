// ROADMAP 1.13, hallazgo W5 de sdd-verify (obs #231/#232 revisión 2) — la
// prueba NEGATIVA de privilegios del rol de solo lectura real (decisión
// 056), vigente desde el paso 1.11 y hasta ahora NUNCA verificada: solo el
// rol `web_coverage`, nuevo en esta misma unidad, tenía su propia suite
// (`coverage-role-privileges.test.ts`). Esta suite cierra ese hueco para el
// rol ORIGINAL. Gateada en `WEB_DATABASE_URL` (describeWithReadonlyDb):
// omitida (`describe.skip`), nunca fallando, si esa variable no existe.
//
// Fichero SEPARADO de `coverage-role-privileges.test.ts` a propósito, no
// una extensión de su mismo `describe`: son dos roles distintos, con dos
// variables de entorno y dos gates distintos — mezclarlos en un solo
// fichero oscurecería cuál test depende de cuál variable si solo una de
// las dos estuviera provisionada.
//
// Sembrado con el owner (`DATABASE_URL`, mismo patrón que el resto de la
// suite de integración); la conexión bajo prueba es EXCLUSIVAMENTE
// `WEB_DATABASE_URL`, el rol de solo lectura real, nunca el owner.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { createDb, getPropertyPriceHistory } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { coverageJobs, listings, locations, sources, zones } from '@buscahogar/db';

import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithReadonlyDb } from '../helpers/readonly-db-gate.js';

async function seedCoverageJob(db: Database): Promise<{ readonly jobId: string }> {
  const [source] = await db
    .insert(sources)
    .values({ key: 'idealista', name: 'Idealista', kind: 'api' })
    .returning({ id: sources.id });
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
  if (!source || !location) {
    throw new Error('No se pudo sembrar source/location de prueba');
  }
  const [zone] = await db.insert(zones).values({ locationId: location.id }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo sembrar zone de prueba');
  }
  const [job] = await db
    .insert(coverageJobs)
    .values({ zoneId: zone.id, sourceId: source.id, operation: 'rent', status: 'pending', cursor: null })
    .returning({ id: coverageJobs.id });
  if (!job) {
    throw new Error('No se pudo sembrar coverage_jobs de prueba');
  }
  return { jobId: job.id };
}

async function seedListing(db: Database): Promise<{ readonly listingId: string }> {
  const [source] = await db
    .insert(sources)
    .values({ key: 'idealista', name: 'Idealista', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo sembrar source de prueba');
  }
  const [listing] = await db
    .insert(listings)
    .values({ sourceId: source.id, externalId: 'ext-readonly-test', url: 'https://example.test/readonly-test' })
    .returning({ id: listings.id });
  if (!listing) {
    throw new Error('No se pudo sembrar listing de prueba');
  }
  return { listingId: listing.id };
}

describeWithReadonlyDb(
  'rol de solo lectura de apps/web — rechazo negativo real (decisión 056, hallazgo W5)',
  () => {
    let ownerDb: Database;
    let ownerPool: import('../helpers/db-client.js').TestDbHandle['pool'];
    let readonlyPool: import('../helpers/db-client.js').TestDbHandle['pool'];
    let readonlyDb: Database;

    beforeAll(() => {
      ({ db: ownerDb, pool: ownerPool } = connectTestDb());
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- describeWithReadonlyDb ya garantiza que la variable existe
      ({ db: readonlyDb, pool: readonlyPool } = createDb(process.env.WEB_DATABASE_URL!));
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

    it('SELECT en coverage_jobs SÍ está permitido', async () => {
      await seedCoverageJob(ownerDb);

      await expect(readonlyPool.query('select * from coverage_jobs limit 1')).resolves.toBeDefined();
    });

    // D.10: el histórico de precios lee `listing_versions` sin filtrar por
    // `is_current`; el rol de solo lectura ya tiene SELECT (sin cambio de
    // permisos).
    it('SELECT en listing_versions SÍ está permitido', async () => {
      await expect(readonlyPool.query('select * from listing_versions limit 1')).resolves.toBeDefined();
    });

    it('getPropertyPriceHistory se ejecuta con el rol de solo lectura', async () => {
      await expect(getPropertyPriceHistory(readonlyDb, randomUUID())).resolves.toEqual([]);
    });

    it('INSERT en coverage_jobs está RECHAZADO', async () => {
      // IDs sin sembrar a propósito: el rechazo por privilegio ocurre en la
      // fase de comprobación de permisos de PostgreSQL, antes de evaluar
      // cualquier restricción de clave foránea o índice único, así que no
      // hace falta (ni conviene) que las filas referenciadas existan.
      await expect(
        readonlyPool.query(
          'insert into coverage_jobs (zone_id, source_id, operation, status, cursor) values ($1, $2, $3, $4, null)',
          [randomUUID(), randomUUID(), 'rent', 'pending']
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('UPDATE en coverage_jobs está RECHAZADO', async () => {
      const { jobId } = await seedCoverageJob(ownerDb);

      await expect(
        readonlyPool.query('update coverage_jobs set status = $1 where id = $2', ['done', jobId])
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('DELETE en coverage_jobs está RECHAZADO', async () => {
      const { jobId } = await seedCoverageJob(ownerDb);

      await expect(readonlyPool.query('delete from coverage_jobs where id = $1', [jobId])).rejects.toMatchObject({
        code: '42501',
      });
    });

    it('INSERT en listings está RECHAZADO', async () => {
      await expect(
        readonlyPool.query('insert into listings (source_id, external_id, url) values ($1, $2, $3)', [
          randomUUID(),
          'rejected-insert',
          'https://example.test/rejected',
        ])
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('UPDATE en listings está RECHAZADO', async () => {
      const { listingId } = await seedListing(ownerDb);

      await expect(
        readonlyPool.query('update listings set status = $1 where id = $2', ['inactive', listingId])
      ).rejects.toMatchObject({ code: '42501' });
    });

    // ROADMAP 2.4, decisión 101: la búsqueda pagina 25 filas y nunca se
    // beneficia del JIT; con 1M de filas, una estimación de coste inflada lo
    // activaba y la compilación (~550 ms) dominaba la consulta. El bootstrap
    // de roles fija `jit = off` para este rol en `buscahogar`.
    it('la sesión del rol de solo lectura tiene el JIT desactivado', async () => {
      const { rows } = await readonlyPool.query<{ jit: string }>('show jit');
      expect(rows[0]?.jit).toBe('off');
    });

    it('DELETE en listings está RECHAZADO', async () => {
      const { listingId } = await seedListing(ownerDb);

      await expect(readonlyPool.query('delete from listings where id = $1', [listingId])).rejects.toMatchObject({
        code: '42501',
      });
    });
  }
);

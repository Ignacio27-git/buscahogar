// ROADMAP 1.13 Unit D (tarea 10.6, R3, DD-15 punto 4; docs/DECISIONS.md,
// decisión 064) — la prueba NEGATIVA de privilegios del rol INSERT-only
// real. Gateada en `WEB_COVERAGE_DATABASE_URL` (describeWithCoverageDb):
// omitida (`describe.skip`), nunca fallando, mientras esa variable no
// exista — el rol todavía no está provisionado (tarea 10.5, tarea
// MAINTAINER-ONLY, ningún agente puede crear roles de PostgreSQL ni tocar
// el `.env` de la raíz).
//
// **Esta suite nunca se ha ejecutado en verde. Queda escrita y lista para
// correr en cuanto el mantenedor provisione el rol y añada la variable —
// nunca simulada, nunca su ausencia convertida en un fallo del pipeline.**
//
// Sembrado con el owner (`DATABASE_URL`, mismo patrón que el resto de la
// suite de integración); la conexión bajo prueba es EXCLUSIVAMENTE
// `WEB_COVERAGE_DATABASE_URL`, el rol restringido real, nunca el owner.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { createDb } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { coverageJobs, locations, sources, zones } from '@buscahogar/db';

import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithCoverageDb } from '../helpers/coverage-db-gate.js';

async function seedZoneAndSource(
  db: Database
): Promise<{ readonly zoneId: string; readonly sourceId: string; readonly jobId: string }> {
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
    .values({ zoneId: zone.id, sourceId: source.id, status: 'pending', cursor: null })
    .returning({ id: coverageJobs.id });
  if (!job) {
    throw new Error('No se pudo sembrar coverage_jobs de prueba');
  }
  return { zoneId: zone.id, sourceId: source.id, jobId: job.id };
}

describeWithCoverageDb('rol INSERT-only de coverage_jobs — rechazo negativo real (R3, decisión 064)', () => {
  let ownerDb: Database;
  let ownerPool: import('../helpers/db-client.js').TestDbHandle['pool'];
  let coveragePool: import('../helpers/db-client.js').TestDbHandle['pool'];

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

  it('INSERT en coverage_jobs (con zone/source reales) SÍ está permitido', async () => {
    const { zoneId, sourceId, jobId } = await seedZoneAndSource(ownerDb);
    // `seedZoneAndSource` deja un job 'pending' para este mismo par
    // (zone_id, source_id) porque los casos NEGATIVOS necesitan un `jobId`
    // al que apuntar. Aquí estorba: el índice único parcial
    // `coverage_jobs_zone_source_pending_idx` (DD-16/CR-3) rechazaría el
    // insert con 23505 antes de que el permiso llegue siquiera a evaluarse,
    // y el caso positivo nunca podría pasar. Se borra con la conexión
    // PROPIETARIA — el rol de cobertura no tiene DELETE, que es justo lo
    // que comprueba el caso negativo de más abajo.
    await ownerPool.query('delete from coverage_jobs where id = $1', [jobId]);

    await expect(
      coveragePool.query(
        'insert into coverage_jobs (zone_id, source_id, status, cursor) values ($1, $2, $3, null)',
        [zoneId, sourceId, 'pending']
      )
    ).resolves.toBeDefined();
  });

  it('UPDATE en coverage_jobs está RECHAZADO', async () => {
    const { jobId } = await seedZoneAndSource(ownerDb);

    await expect(coveragePool.query('update coverage_jobs set status = $1 where id = $2', ['done', jobId])).rejects.toMatchObject({
      code: '42501', // insufficient_privilege
    });
  });

  it('DELETE en coverage_jobs está RECHAZADO', async () => {
    const { jobId } = await seedZoneAndSource(ownerDb);

    await expect(coveragePool.query('delete from coverage_jobs where id = $1', [jobId])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('SELECT en coverage_jobs está RECHAZADO (rol INSERT-only, nunca SELECT)', async () => {
    await seedZoneAndSource(ownerDb);

    await expect(coveragePool.query('select * from coverage_jobs limit 1')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('cualquier escritura en zones está RECHAZADA', async () => {
    await expect(
      coveragePool.query('insert into zones (location_id) values ($1)', [randomUUID()])
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cualquier escritura en locations está RECHAZADA', async () => {
    await expect(
      coveragePool.query(
        "insert into locations (ine_code, municipality, province, province_code, autonomous_community, search_name) values ('00001', 'x', 'x', '00', 'x', 'x')"
      )
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cualquier escritura en sources está RECHAZADA', async () => {
    await expect(
      coveragePool.query("insert into sources (key, name, kind) values ('otra-fuente', 'Otra', 'api')")
    ).rejects.toMatchObject({ code: '42501' });
  });
});

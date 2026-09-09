// REQ-SCHEMA-07: el bloqueo geográfico debe medir en METROS de verdad (no en
// los grados del SRS de `location`) y debe apoyarse en el índice GiST, no en
// un recorrido secuencial. Ambas comprobaciones pasan por `withinMeters()`
// (src/spatial.ts), el único punto donde se expresa una distancia — así la
// prueba protege el camino de código real, no una consulta escrita a mano.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { withinMeters } from '../../src/spatial.js';
import { listings } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

// Dos puntos de Madrid a ~500 m de distancia real (ST_Distance sobre
// geography confirmado en ~498.7 m), la misma coordenada de longitud y una
// diferencia de latitud de 0.004491°. Sirven para comprobar que el radio de
// 400 m los excluye y el de 600 m los incluye — el "sanity check" de metros
// frente a grados que motiva toda esta columna generada (D2 del diseño).
const POINT_A = { lon: -3.7038, lat: 40.4168 };
const POINT_B = { lon: -3.7038, lat: 40.421291 };

describeWithDb('withinMeters(): sanity de metros y uso del índice GiST', () => {
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

  describe('sanity de metros', () => {
    it('un radio de 400 m excluye el par y uno de 600 m lo incluye', async () => {
      const sourceId = await insertSource(db);
      const listingIdA = await insertListing(db, sourceId, {
        location: { x: POINT_A.lon, y: POINT_A.lat },
      });
      const listingIdB = await insertListing(db, sourceId, {
        location: { x: POINT_B.lon, y: POINT_B.lat },
      });

      const within400 = await db
        .select({ id: listings.id })
        .from(listings)
        .where(withinMeters(POINT_A.lon, POINT_A.lat, 400));
      const idsWithin400 = within400.map((row) => row.id);
      expect(idsWithin400).toContain(listingIdA);
      expect(idsWithin400).not.toContain(listingIdB);

      const within600 = await db
        .select({ id: listings.id })
        .from(listings)
        .where(withinMeters(POINT_A.lon, POINT_A.lat, 600));
      const idsWithin600 = within600.map((row) => row.id);
      expect(idsWithin600).toContain(listingIdA);
      expect(idsWithin600).toContain(listingIdB);
    });
  });

  // Con un puñado de filas el planificador prefiere correctamente un
  // recorrido secuencial (más barato que abrir el índice) y esta prueba
  // fallaría por motivos ajenos al índice en sí. Por eso el volumen de
  // ~2000 filas y el `ANALYZE` posterior son un requisito de la prueba, no
  // un detalle de implementación (design.md, Testing Strategy).
  describe('uso del índice GiST bajo volumen', () => {
    it('EXPLAIN ANALYZE usa el índice GiST, no un Seq Scan sobre listings', async () => {
      const sourceId = await insertSource(db);
      // Dispersión de ~0.5° en longitud y latitud alrededor de Madrid
      // (decenas de km): suficiente para que el radio de la consulta solo
      // capture una fracción selectiva de las filas.
      await pool.query(
        `INSERT INTO listings (source_id, external_id, url, location)
         SELECT
           $1,
           'bulk-' || gs,
           'https://example.test/bulk/' || gs,
           ST_SetSRID(ST_MakePoint(
             $2 + (random() - 0.5) * 0.5,
             $3 + (random() - 0.5) * 0.5
           ), 4326)
         FROM generate_series(1, 2000) AS gs`,
        [sourceId, POINT_A.lon, POINT_A.lat]
      );
      await pool.query('ANALYZE listings');

      const query = db
        .select({ id: listings.id })
        .from(listings)
        .where(withinMeters(POINT_A.lon, POINT_A.lat, 5000));
      const { sql: queryText, params } = query.toSQL();

      const { rows } = await pool.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${queryText}`,
        params
      );
      const rawPlan = rows[0]?.['QUERY PLAN'];
      const plan: unknown =
        typeof rawPlan === 'string' ? (JSON.parse(rawPlan) as unknown) : rawPlan;
      const planText = JSON.stringify(plan);

      expect(planText).not.toContain('Seq Scan on listings');
      expect(planText).toContain('listings_location_geography_idx');
    });
  });
});

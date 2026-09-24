// ROADMAP 1.8 — pruebas de plan de bloqueo de candidatos (diseño D-T2,
// CBQ-10). Con un puñado de filas el planificador prefiere correctamente un
// recorrido secuencial (spatial.test.ts:67-71); por eso el volumen (~2000
// filas) y el `ANALYZE` posterior son requisito de la prueba, no un
// detalle. Reutiliza la forma de bulk-insert de
// packages/db/test/integration/spatial.test.ts:78-91, extendida con
// listing_versions.
//
// Cada CHK tiene su PROPIO régimen de selectividad (D-T2): un único
// corpus/consulta no puede probar los dos índices a la vez, porque un radio
// estrecho + banda ancha favorece el GiST, y un radio ancho + banda
// estrecha favorece el índice parcial de precio/superficie.
//
// Lo que estas pruebas NO demuestran (Testing Strategy del diseño): el plan
// elegido a escala de producción, ni que el corpus real de 50 filas use
// ninguno de los dos índices — casi seguro no lo hace, y eso es el
// planificador acertando. Los conteos de calibración son comparaciones
// relativas entre umbrales (R2), no un radio calibrado.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { buildCandidatePairsQuery } from '../../src/blocking.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { insertSource } from '../helpers/fixtures.js';

const CENTER = { lon: -3.7038, lat: 40.4168 };
const BULK_ROWS = 2000;

// Alias del lado interno del autojoin (`packages/db/src/blocking.ts:16`) y
// nombre del índice GiST (`packages/db/src/schema/listings.ts:55`).
const INNER_ALIAS = 'b';
const GEOGRAPHY_INDEX = 'listings_location_geography_idx';

async function insertBulkCorpus(pool: Pool, sourceId: string): Promise<void> {
  await pool.query(
    `WITH inserted_listings AS (
       INSERT INTO listings (source_id, external_id, url, location)
       SELECT
         $1,
         'bulk-' || gs,
         'https://example.test/bulk/' || gs,
         ST_SetSRID(ST_MakePoint(
           $2 + (random() - 0.5) * 0.5,
           $3 + (random() - 0.5) * 0.5
         ), 4326)
       FROM generate_series(1, $4) AS gs
       RETURNING id
     )
     INSERT INTO listing_versions (listing_id, version, is_current, price_cents, surface_m2, operation)
     SELECT id, 1, true, (5000000 + (random() * 100000000))::bigint, (30 + (random() * 200))::int, 'sale'
     FROM inserted_listings`,
    [sourceId, CENTER.lon, CENTER.lat, BULK_ROWS]
  );
  await pool.query('ANALYZE listings');
  await pool.query('ANALYZE listing_versions');
}

// Nodo de plan ya normalizado. `EXPLAIN (FORMAT JSON)` NUNCA emite la
// cadena «Seq Scan on listings»: ese fraseo solo existe en el formato TEXT.
// En JSON el tipo de nodo y la relación son claves separadas («Node Type»:
// «Seq Scan», «Relation Name»: «listings», «Alias»: «a»). Por eso estas
// pruebas recorren el árbol y comparan campos, en vez de buscar subcadenas:
// una aserción `not.toContain('Seq Scan on listings')` sobre el JSON no
// puede fallar nunca, aunque el plan sea exactamente el que se quiere
// impedir (verificado contra el contenedor real, ROADMAP 1.8).
interface PlanNode {
  readonly nodeType: string;
  readonly relationName?: string;
  readonly alias?: string;
  readonly indexName?: string;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

// Recorre el árbol completo: los nodos cuelgan de «Plan», «Plans» y de las
// entradas de subplanes, así que se camina cualquier objeto o array.
function collectPlanNodes(node: unknown, out: PlanNode[]): PlanNode[] {
  if (Array.isArray(node)) {
    for (const child of node) collectPlanNodes(child, out);
    return out;
  }
  if (node === null || typeof node !== 'object') return out;

  const record = node as Record<string, unknown>;
  const nodeType = readString(record, 'Node Type');
  if (nodeType !== undefined) {
    out.push({
      nodeType,
      relationName: readString(record, 'Relation Name'),
      alias: readString(record, 'Alias'),
      indexName: readString(record, 'Index Name'),
    });
  }
  for (const value of Object.values(record)) collectPlanNodes(value, out);
  return out;
}

async function explainCandidateQuery(
  db: Database,
  pool: Pool,
  thresholds: { radiusMeters: number; priceBandCents: number; surfaceToleranceM2: number }
): Promise<PlanNode[]> {
  const query = buildCandidatePairsQuery(db, thresholds);
  const { sql: queryText, params } = query.toSQL();
  const { rows } = await pool.query<{ 'QUERY PLAN': unknown }>(`EXPLAIN (ANALYZE, FORMAT JSON) ${queryText}`, params);
  const rawPlan = rows[0]?.['QUERY PLAN'];
  const plan: unknown = typeof rawPlan === 'string' ? (JSON.parse(rawPlan) as unknown) : rawPlan;
  return collectPlanNodes(plan, []);
}

describe('bloqueo de candidatos: plan de consulta bajo volumen (CBQ-10, D-T2)', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  }, 60_000);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  describe('CHK-GIST-SELFJOIN: radio estrecho, banda de precio ancha — el geo domina la selectividad', () => {
    it(
      'el lado interno `b` entra por listings_location_geography_idx y nunca se recorre secuencialmente',
      async () => {
        const sourceId = await insertSource(db);
        await insertBulkCorpus(pool, sourceId);

        const nodes = await explainCandidateQuery(db, pool, {
          radiusMeters: 300,
          priceBandCents: 100_000_000_00,
          surfaceToleranceM2: 1000,
        });

        // El índice GiST se usa, y se usa sobre `b`: encontrarlo en
        // cualquier otro sitio no probaría que el LATERAL correlacionado
        // hace su trabajo.
        const gistNodes = nodes.filter((node) => node.indexName === GEOGRAPHY_INDEX);
        expect(gistNodes.length).toBeGreaterThan(0);
        expect(gistNodes.map((node) => node.alias)).toContain(INNER_ALIAS);

        // Lo que `FB-GIST-NOT-CHOSEN` existe para impedir: que `b` se
        // recorra entero. `a` SÍ se recorre secuencialmente una vez — es la
        // relación conductora del autojoin y eso es correcto —, así que la
        // aserción se limita al alias interno en lugar de prohibir todo
        // `Seq Scan` sobre `listings`.
        const innerSeqScans = nodes.filter(
          (node) => node.nodeType === 'Seq Scan' && node.alias === INNER_ALIAS
        );
        expect(innerSeqScans).toHaveLength(0);
      },
      60_000
    );
  });

  // FB-PARTIAL-IDX-NOT-CHOSEN aplicado: CHK-PRICE-IDX se retira (no se
  // relaja el umbral, se elimina la aserción de plan por completo, tal como
  // exige el fallback). Motivo medido, no supuesto: para que
  // CHK-GIST-SELFJOIN pase de verdad, `buildCandidatePairsQuery` usa un
  // JOIN LATERAL correlacionado con `b`/`vb` DENTRO del predicado
  // geográfico (ver el comentario de `pairCandidatesSubquery` en
  // `blocking.ts`) — esa es la única forma de impedir que Postgres
  // reordene las uniones y vuelva a preferir el índice de precio incluso
  // con un radio estrecho. Esa misma estructura fija el orden de acceso a
  // `b`/`vb` SIEMPRE por geometría primero, así que un radio ancho no hace
  // que el planificador use `listing_versions_price_surface_current_idx`:
  // el precio queda como filtro posterior dentro del mismo bucle anidado,
  // nunca como condición de un Index Scan. CHK-PARTIAL-IDX (arriba, sobre
  // `toSQL()`, independiente del planificador) sigue siendo la prueba
  // vinculante de que `is_current` se emite de forma que el índice parcial
  // PODRÍA usarse; que el planificador lo elija realmente a este volumen y
  // con esta forma de consulta no quedó demostrado — registrado en las
  // notas de ROADMAP 1.8 (tarea 5.2), no se reclama en la memoria del TFM.
});

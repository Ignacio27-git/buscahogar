// ROADMAP 1.11 — el recuento de fuentes distintas (A-1, docs/DECISIONS.md
// decisión 058) se emite como subconsulta escalar correlacionada dentro de la
// PROYECCIÓN de `buildPropertySearchQuery`.
//
// Por qué este fichero existe, además de `search.test.ts`:
//
// Los 21 tests de `search.test.ts` comparan la FORMA del SQL emitido con
// `.toSQL()`, sin conectar a ninguna base de datos. Esa comparación no puede
// distinguir SQL válido de SQL inválido: la primera versión de esta
// subconsulta interpolaba columnas de Drizzle (`${listings.id}`) dentro de la
// plantilla `sql`, que en la proyección las emite SIN prefijo de tabla, y el
// `"id"` resultante era ambiguo entre `listings.id` y el `properties.id` de la
// consulta externa. Postgres la rechazaba con 42702, `column reference "id" is
// ambiguous`, y los 21 tests seguían en verde — pasaban igual con el SQL roto
// y con el corregido, porque ninguno la ejecutaba.
//
// 42702 es un error de PARSEO, así que se dispara aunque no haya ni una fila.
// De ahí el primer caso: ejecutar la consulta contra Postgres, con las tablas
// vacías, ya es la prueba vinculante de que el SQL es válido.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { PropertySearchCriteria } from '@buscahogar/core';

import type { Database } from '../../src/db.js';
import { searchProperties } from '../../src/search.js';
import { properties, propertyListings } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertSource } from '../helpers/fixtures.js';

// Criterios mínimos: solo lo que `buildPropertySearchQuery` lee siempre
// (`sort`, `dir`, `page`). Sin ningún filtro activo, para que la regla NULL
// (A-2) no excluya las filas sembradas y el caso mida solo el recuento.
const BASE_CRITERIA: PropertySearchCriteria = {
  page: 1,
  sort: 'updated',
  dir: 'desc',
};

/** Siembra una vivienda canónica y le asocia los anuncios indicados. */
async function insertPropertyWithListings(
  db: Database,
  listingIds: readonly string[],
  values: Partial<typeof properties.$inferInsert> = {}
): Promise<string> {
  const [property] = await db.insert(properties).values(values).returning({ id: properties.id });
  if (!property) {
    throw new Error('No se pudo insertar la vivienda de prueba');
  }
  for (const listingId of listingIds) {
    await db.insert(propertyListings).values({
      propertyId: property.id,
      listingId,
      score: 1,
      strategyName: 'test',
      strategyVersion: '1',
      signals: {},
    });
  }
  return property.id;
}

describeWithDb('searchProperties contra Postgres real', () => {
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

  // CHK-SEARCH-EXEC: la prueba vinculante de validez. Con las tablas vacías no
  // hay nada que contar, pero Postgres sí parsea la sentencia entera: si la
  // subconsulta correlacionada vuelve a emitir una referencia ambigua, esto
  // falla con 42702 aunque no exista ni una fila.
  it('ejecuta la consulta sin error de SQL aunque no haya ninguna fila', async () => {
    const page = await searchProperties(db, BASE_CRITERIA);

    expect(page.results).toEqual([]);
    expect(page.hasNextPage).toBe(false);
  });

  // CHK-SEARCH-COUNT-1: A-1 dice FUENTES distintas, no anuncios. Con dos
  // anuncios de la MISMA fuente el recuento debe ser 1. Si la subconsulta
  // contara filas de `property_listings` —o si `properties.listingCount` se
  // usara en su lugar— aquí saldría 2.
  it('cuenta una sola fuente cuando dos anuncios vienen de la misma', async () => {
    const sourceId = await insertSource(db);
    const first = await insertListing(db, sourceId);
    const second = await insertListing(db, sourceId);
    await insertPropertyWithListings(db, [first, second]);

    const page = await searchProperties(db, BASE_CRITERIA);

    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.distinctSourceCount).toBe(1);
  });

  // CHK-SEARCH-COUNT-2: el otro lado de la misma regla. Dos fuentes distintas
  // cuentan 2, lo que además prueba que la subconsulta correlaciona con la
  // vivienda de la fila y no agrega sobre toda la tabla.
  it('cuenta dos fuentes cuando los anuncios vienen de fuentes distintas', async () => {
    const firstSource = await insertSource(db);
    const secondSource = await insertSource(db);
    const first = await insertListing(db, firstSource);
    const second = await insertListing(db, secondSource);
    await insertPropertyWithListings(db, [first, second]);

    const page = await searchProperties(db, BASE_CRITERIA);

    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.distinctSourceCount).toBe(2);
  });

  // CHK-SEARCH-CORRELATION: dos viviendas con distinto número de fuentes en la
  // misma página. Una subconsulta mal correlacionada daría el mismo valor a
  // las dos filas, que es exactamente lo que un caso de una sola fila no ve.
  it('da a cada vivienda su propio recuento dentro de la misma página', async () => {
    const firstSource = await insertSource(db);
    const secondSource = await insertSource(db);

    const soloListing = await insertListing(db, firstSource);
    const soloProperty = await insertPropertyWithListings(db, [soloListing]);

    const pairA = await insertListing(db, firstSource);
    const pairB = await insertListing(db, secondSource);
    const pairProperty = await insertPropertyWithListings(db, [pairA, pairB]);

    const page = await searchProperties(db, BASE_CRITERIA);

    const byId = new Map(page.results.map((row) => [row.id, row.distinctSourceCount]));
    expect(byId.get(soloProperty)).toBe(1);
    expect(byId.get(pairProperty)).toBe(2);
  });

  // Los tres casos siguientes cubren escenarios que `sdd-verify` (obs #182)
  // dejó anotados como riesgo abierto: estaban cubiertos SOLO por aserciones de
  // forma con `.toSQL()`, el mismo patrón que dejó pasar el 42702. Aquí se
  // ejercitan con datos reales en Postgres.

  // CHK-SEARCH-NULL: la regla A-2 (decisión 058) sobre datos, no sobre la forma
  // del SQL. Un filtro ACTIVO excluye la fila con NULL en esa columna; el mismo
  // filtro AUSENTE la incluye. Las dos mitades importan: comprobar solo la
  // primera no distinguiría la regla de un `WHERE` que excluyera siempre.
  it('excluye NULL con el filtro activo y lo incluye con el filtro ausente', async () => {
    const flatId = await insertPropertyWithListings(db, [], { propertyType: 'flat' });
    const unknownTypeId = await insertPropertyWithListings(db, []); // propertyType queda NULL

    const filtered = await searchProperties(db, { ...BASE_CRITERIA, propertyType: 'flat' });
    expect(filtered.results.map((row) => row.id)).toEqual([flatId]);

    const unfiltered = await searchProperties(db, BASE_CRITERIA);
    expect(unfiltered.results.map((row) => row.id).sort()).toEqual([flatId, unknownTypeId].sort());
  });

  // CHK-SEARCH-NULLSLAST: `NULLS LAST` explícito (A-3, decisión 058) con una
  // fila de precio NULL de verdad. El caso DESCENDENTE es el que importa:
  // Postgres ordena NULLS FIRST por defecto en DESC, así que sin el `nulls
  // last` explícito la vivienda sin precio encabezaría «de más caro a más
  // barato». Una aserción de forma sobre `.toSQL()` no puede ver eso.
  it('deja las filas sin precio al final en los dos sentidos de orden', async () => {
    const cheap = await insertPropertyWithListings(db, [], { minPriceCents: 100_000_00 });
    const expensive = await insertPropertyWithListings(db, [], { minPriceCents: 300_000_00 });
    const priceless = await insertPropertyWithListings(db, []); // minPriceCents NULL

    const ascending = await searchProperties(db, { ...BASE_CRITERIA, sort: 'price', dir: 'asc' });
    expect(ascending.results.map((row) => row.id)).toEqual([cheap, expensive, priceless]);

    const descending = await searchProperties(db, { ...BASE_CRITERIA, sort: 'price', dir: 'desc' });
    expect(descending.results.map((row) => row.id)).toEqual([expensive, cheap, priceless]);
  });

  // CHK-SEARCH-PASTEND: «Past the last page» — pedir una página más allá de los
  // datos reales, pero DENTRO del tope de `page`, devuelve cero filas y NO es un
  // error. El rechazo es solo para el tope (`page > 100`), que cubre
  // `search-query.schema.test.ts`; quedarse sin datos es un resultado válido.
  it('devuelve cero filas, sin error, al pedir una página más allá de los datos', async () => {
    await insertPropertyWithListings(db, []);
    await insertPropertyWithListings(db, []);

    const page = await searchProperties(db, { ...BASE_CRITERIA, page: 3 });

    expect(page.results).toEqual([]);
    expect(page.hasNextPage).toBe(false);
  });
});

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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PropertySearchCriteria } from '@buscahogar/core';

import type { ConsolidationInput } from '../../src/consolidation.js';
import { writeConsolidation } from '../../src/consolidation.js';
import type { Database } from '../../src/db.js';
import { getPropertyDetailHeader } from '../../src/detail.js';
import { searchProperties } from '../../src/search.js';
import { listingVersions, properties, propertyListings } from '../../src/tables.js';
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

  // ROADMAP 1.12 (diseño D4/AR-4, docs/DECISIONS.md decisión 061) — la
  // proyección del anchor listing id, EJECUTANDO contra Postgres real: mismo
  // DEFECT-1 que `distinctSourceCount` arriba, evidencia vinculante
  // obligatoria (`.toSQL()` sola no basta).
  describe('anchorListingId — proyección correlacionada, EJECUTANDO (D4/AR-4)', () => {
    it('el anchor es el mínimo de los 3 listingId miembro de la vivienda', async () => {
      const sourceId = await insertSource(db);
      const listingIds = [
        await insertListing(db, sourceId),
        await insertListing(db, sourceId),
        await insertListing(db, sourceId),
      ].sort();
      await insertPropertyWithListings(db, listingIds);

      const page = await searchProperties(db, BASE_CRITERIA);

      expect(page.results).toHaveLength(1);
      expect(page.results[0]?.anchorListingId).toBe(listingIds[0]);
    });

    it('el anchor sigue resolviendo tras un reproceso que mueve el listing anchor a otra vivienda', async () => {
      const sourceId = await insertSource(db);
      const anchorListing = await insertListing(db, sourceId);
      const otherListing = await insertListing(db, sourceId);
      await db
        .insert(listingVersions)
        .values({ listingId: anchorListing, version: 1, isCurrent: true, priceCents: 100_000_00, operation: 'sale' });
      await db
        .insert(listingVersions)
        .values({ listingId: otherListing, version: 1, isCurrent: true, priceCents: 150_000_00, operation: 'sale' });

      // Primer reproceso: los dos listings forman una única vivienda — el
      // anchor es el mínimo de ambos. Un grupo de más de un miembro exige al
      // menos una arista 'accept' hacia su propio grupo (invariante de
      // buildPropertyGroups, packages/core).
      const [pairA, pairB] = [anchorListing, otherListing].sort();
      const baseInput: ConsolidationInput = {
        strategyName: 'test',
        strategyVersion: '1',
        radiusMeters: 300,
        priceBandCents: 2_500_000,
        surfaceToleranceM2: 10,
        listingsConsidered: 2,
        pairs: [
          {
            listingAId: pairA as string,
            listingBId: pairB as string,
            band: 'accept',
            score: 0.95,
            signals: { exactAddress: { value: 1, weight: 0.7 } },
          },
        ],
        groups: [{ listingIds: [anchorListing, otherListing].sort(), winnerId: anchorListing }],
        refusedComponentsCount: 0,
      };
      await writeConsolidation(db, baseInput);

      const beforePage = await searchProperties(db, BASE_CRITERIA);
      const oldAnchorUrl = beforePage.results[0]?.anchorListingId;
      expect(oldAnchorUrl).toBeDefined();

      // Segundo reproceso: cada listing pasa a ser su propia vivienda
      // (singleton) — el anchor original deja de estar en el mismo grupo.
      await writeConsolidation(db, {
        ...baseInput,
        groups: [
          { listingIds: [anchorListing], winnerId: anchorListing },
          { listingIds: [otherListing], winnerId: otherListing },
        ],
      });

      // La URL construida con el anchor ANTIGUO sigue resolviendo (a través
      // de property-detail-route, que resuelve por listings.id, estable) a
      // la vivienda que ahora lo contiene — aunque ya no sea la misma
      // vivienda de antes.
      const stillResolves = await getPropertyDetailHeader(db, oldAnchorUrl as string);
      expect(stillResolves).toBeDefined();
    });
  });
});

// ROADMAP 1.11 — buildPropertySearchQuery (diseño D3; docs/DECISIONS.md,
// decisión 058). Zod-free (decisión 023): importa `PropertySearchCriteria`
// solo como tipo, exactamente como `blocking.ts:10` importa
// `BlockingThresholds`. Exportada (no interna) por el mismo motivo que
// `buildCandidatePairsQuery` (blocking.ts:125-128): el test vinculante
// inspecciona `.toSQL()` de la MISMA consulta que ejecuta `searchProperties`.
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PropertySearchCriteria } from '@buscahogar/core';

import type { Database } from './db.js';
import { pointWithinMeters } from './spatial.js';
import { properties } from './tables.js';

// Constante de servidor (D2): nunca un parámetro de URL. Se piden PAGE_SIZE
// + 1 filas para derivar `hasNextPage` sin un segundo recorrido
// (`COUNT(*) OVER()`, rechazado en la decisión 058) — la fila sobrante se
// recorta en `searchProperties`, nunca aquí.
export const PAGE_SIZE = 24;

// Recuento de fuentes distintas (A-1, decisión 058): subconsulta escalar
// correlacionada en la PROYECCIÓN, nunca en WHERE — misma disciplina que
// `blocking.ts:138-140` para ST_Distance. Sin join a `sources`:
// `listings.sourceId` es `notNull().references(() => sources.id)`
// (listings.ts:25-27), así que `count(DISTINCT listings.source_id) ≡
// count(DISTINCT sources.id)` para cualquier fila que pueda existir.
//
// Nombres literales y CUALIFICADOS a propósito. Interpolar columnas de
// Drizzle (`${listings.id}`) dentro de una plantilla `sql` situada en la
// PROYECCIÓN las emite SIN prefijo de tabla, y el `"id"` resultante era
// ambiguo entre `listings.id` y el `properties.id` de la consulta externa:
// Postgres 42702, `column reference "id" is ambiguous`. Los alias
// `src_pl`/`src_l` aíslan el ámbito interno y la correlación con la
// consulta externa se escribe cualificada.
//
// El fallo no lo detectó ninguno de los 21 tests de `.toSQL()`: comparan la
// FORMA del SQL emitido, no su validez. Lo cubre ahora un test que EJECUTA
// la consulta contra Postgres (`test/search/search.db.test.ts`).
const distinctSourceCount = sql<number>`(
  SELECT count(DISTINCT src_l."source_id")
    FROM "property_listings" AS src_pl
    JOIN "listings" AS src_l ON src_l."id" = src_pl."listing_id"
   WHERE src_pl."property_id" = "properties"."id")`.mapWith(Number);

// ROADMAP 1.12 (diseño D4; arbitraje AR-4, docs/DECISIONS.md decisión 061) —
// anchor listing id para que un result card pueda construir un href
// PD-1-compliant sin una consulta extra por tarjeta (A-8). Misma disciplina
// EXACTA que `distinctSourceCount` arriba, DEFECT-1 (`search.ts:28-38`
// original): nombres de tabla como literales SQL con alias (`anchor_pl`),
// nunca `${propertyListings}` — interpolar una columna de Drizzle en la
// PROYECCIÓN la emite SIN prefijo de tabla, y el `"id"` resultante sería
// ambiguo entre `property_listings.id` y `properties.id`. Correlación
// cualificada (`"properties"."id"`), nunca `${properties.id}`.
//
// SIN `.mapWith()`, a diferencia de `distinctSourceCount`: el valor
// resultante ya es `uuid`, que node-postgres representa como cadena —
// añadir `.mapWith(Number)` aquí produciría `NaN` en silencio.
//
// **Corrección frente al diseño (obs #191, D4), verificada contra Postgres
// real**: el diseño proponía `min(anchor_pl."listing_id")` y documentaba
// `ORDER BY … ASC LIMIT 1` como "el equivalente independiente de versión".
// PostgreSQL 17 (`docker-compose.yml` fija `postgis/postgis:17-3.5`) rechazó
// `min(uuid)` en tiempo de EJECUCIÓN con 42883 (`function min(uuid) does not
// exist`): no es una cuestión de versión — `uuid` no tiene agregado MIN/MAX
// nativo en ninguna versión de PostgreSQL, solo operadores de comparación
// b-tree. Se usa el propio fallback nombrado por el diseño, que sí resuelve
// mediante esos operadores de comparación (`<`), nunca un agregado.
// `.toSQL()` no lo habría detectado — misma clase de fallo que DEFECT-1.
const anchorListingId = sql<string | null>`(
  SELECT anchor_pl."listing_id"
    FROM "property_listings" AS anchor_pl
   WHERE anchor_pl."property_id" = "properties"."id"
   ORDER BY anchor_pl."listing_id" ASC
   LIMIT 1)`;

function buildFilters(criteria: PropertySearchCriteria): SQL[] {
  const filters: SQL[] = [];

  // Regla NULL (A-2, decisión 058): un filtro AUSENTE no añade ningún
  // predicado (la fila entra con independencia de esa columna); un filtro
  // ACTIVO excluye cualquier fila NULL en su columna por la lógica
  // trivaluada de SQL — deliberadamente SIN la rama `OR … IS NULL` que
  // `blocking.ts` (D-Q3) sí añade para su propio caso de uso.
  if (criteria.operation !== undefined) {
    filters.push(eq(properties.operation, criteria.operation));
  }
  if (criteria.propertyType !== undefined) {
    filters.push(eq(properties.propertyType, criteria.propertyType));
  }
  if (criteria.minPriceCents !== undefined) {
    filters.push(gte(properties.minPriceCents, criteria.minPriceCents));
  }
  if (criteria.maxPriceCents !== undefined) {
    filters.push(lte(properties.minPriceCents, criteria.maxPriceCents));
  }
  if (criteria.minSurfaceM2 !== undefined) {
    filters.push(gte(properties.surfaceM2, criteria.minSurfaceM2));
  }
  if (criteria.maxSurfaceM2 !== undefined) {
    filters.push(lte(properties.surfaceM2, criteria.maxSurfaceM2));
  }
  // "Al menos N habitaciones/baños" (umbral mínimo, spec confirmada contra
  // D3): gte, nunca igualdad exacta.
  if (criteria.minRooms !== undefined) {
    filters.push(gte(properties.rooms, criteria.minRooms));
  }
  if (criteria.minBathrooms !== undefined) {
    filters.push(gte(properties.bathrooms, criteria.minBathrooms));
  }
  if (criteria.geo !== undefined) {
    filters.push(pointWithinMeters(properties.locationGeography, criteria.geo.lon, criteria.geo.lat, criteria.geo.radiusMeters));
  }

  return filters;
}

function sortColumn(sort: PropertySearchCriteria['sort']): typeof properties.minPriceCents | typeof properties.surfaceM2 | typeof properties.updatedAt {
  if (sort === 'price') {
    return properties.minPriceCents;
  }
  if (sort === 'surface') {
    return properties.surfaceM2;
  }
  return properties.updatedAt;
}

// Exportada a propósito (ver cabecera del fichero): el test vinculante
// inspecciona `.toSQL()` de esta MISMA función, nunca una reescrita a mano.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildPropertySearchQuery(db: Database, criteria: PropertySearchCriteria) {
  const filters = buildFilters(criteria);
  const column = sortColumn(criteria.sort);
  const dirSql = criteria.dir === 'asc' ? sql`asc` : sql`desc`;

  return db
    .select({
      id: properties.id,
      operation: properties.operation,
      propertyType: properties.propertyType,
      minPriceCents: properties.minPriceCents,
      surfaceM2: properties.surfaceM2,
      rooms: properties.rooms,
      bathrooms: properties.bathrooms,
      address: properties.address,
      floor: properties.floor,
      title: properties.title,
      description: properties.description,
      thumbnailUrl: properties.thumbnailUrl,
      updatedAt: properties.updatedAt,
      distinctSourceCount,
      anchorListingId,
    })
    .from(properties)
    .where(filters.length > 0 ? and(...filters) : undefined)
    // `NULLS LAST` explícito y uniforme en las tres columnas de orden (D3):
    // `updatedAt` es NOT NULL (properties.ts:57), así que aquí es un no-op
    // — emitido igual para que la regla bajo prueba sea una sola, no tres.
    // Desempate `properties.id ASC`: uuid, orden total de Postgres,
    // determinista dentro de una misma generación de la caché (decisión 054).
    .orderBy(sql`${column} ${dirSql} nulls last`, asc(properties.id))
    .limit(PAGE_SIZE + 1)
    .offset((criteria.page - 1) * PAGE_SIZE);
}

export interface PropertySearchResult {
  readonly id: string;
  readonly operation: string | null;
  readonly propertyType: string | null;
  readonly minPriceCents: number | null;
  readonly surfaceM2: number | null;
  readonly rooms: number | null;
  readonly bathrooms: number | null;
  readonly address: string | null;
  readonly floor: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly thumbnailUrl: string | null;
  readonly updatedAt: Date;
  readonly distinctSourceCount: number;
  readonly anchorListingId: string | null;
}

export interface PropertySearchPage {
  readonly results: readonly PropertySearchResult[];
  readonly hasNextPage: boolean;
}

// Capa fina que EJECUTA `buildPropertySearchQuery` y recorta la fila
// sobrante (D3): `hasNextPage` se deriva de haber recibido PAGE_SIZE + 1
// filas, nunca de un `COUNT(*) OVER()` (decisión 058).
export async function searchProperties(db: Database, criteria: PropertySearchCriteria): Promise<PropertySearchPage> {
  const rows = await buildPropertySearchQuery(db, criteria);
  const hasNextPage = rows.length > PAGE_SIZE;
  return { results: rows.slice(0, PAGE_SIZE), hasNextPage };
}

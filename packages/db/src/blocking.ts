// ROADMAP 1.8 — bloqueo de candidatos: convierte `listings` + la versión
// `is_current` de `listing_versions` en pares candidatos, vía un único
// predicado compartido por la consulta de filas y la de conteo (A1 del
// diseño). Nunca toca `property_listings` (Q1) ni filtra por `sourceId`
// (Q2) ni por `listings.status` (CBQ-9): el bloqueo debe permanecer
// permisivo — un par que nunca emite no puede recuperarse en ROADMAP 1.9.
import { alias } from 'drizzle-orm/pg-core';
import { and, count, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BlockingThresholds, CandidatePair } from '@buscahogar/core';
import type { Database } from './db.js';
import { rowsWithinMeters } from './spatial.js';
import { listingVersions, listings } from './tables.js';

const a = alias(listings, 'a');
const b = alias(listings, 'b');
const va = alias(listingVersions, 'va');
const vb = alias(listingVersions, 'vb');

// D-Q2: emitida como columna booleana DESNUDA — `sql\`${v.isCurrent}\`` en
// vez de `eq(v.isCurrent, true)` — para que sea byte-idéntica al predicado
// del índice único parcial y del índice parcial de precio/superficie
// (`listing-versions.ts:60-68`, ambos `WHERE is_current`). Un `eq(...)`
// renderizaría un parámetro ligado (`"is_current" = $n`), y la implicación
// que Postgres necesita para usar un índice parcial dejaría de ser
// verificable sin depender del tipo de plan. CHK-PARTIAL-IDX comprueba esto
// contra `toSQL()`, sin planificador y sin depender del volumen de filas.
function isCurrentHead(v: typeof va | typeof vb): SQL {
  return sql`${v.isCurrent}`;
}

// FB-GIST-NOT-CHOSEN (CHK-GIST-SELFJOIN): medido contra Postgres real, ni
// un `WHERE` plano ni mover el predicado geográfico al `ON` de un INNER
// JOIN normal cambia el plan — para INNER JOIN, Postgres reordena
// libremente el árbol de uniones sin mirar dónde se escribió cada
// condición. Con una banda de precio ancha, el planificador subestima
// drásticamente la selectividad del rango de precio parametrizado (límite
// conocido de estimación para bucles anidados parametrizados) y prefiere
// unir `va`/`vb` primero por el índice de precio, armando un producto
// intermedio de ~2000×2000 filas ANTES de aplicar `ST_DWithin` — el GiST
// nunca se usa.
//
// La única forma de forzar el orden es un JOIN LATERAL: `pairCandidates`
// es una subconsulta correlacionada con `a`/`va` (referencia sus columnas
// en su propio WHERE), así que Postgres debe evaluarla una vez POR FILA
// externa de (a, va) — un bucle anidado real, no reordenable. Dentro de
// ese bucle el único predicado sargable sobre `b` es la geometría, así que
// el plan usa `listings_location_geography_idx`. `innerJoinLateral` existe
// en la versión fijada de Drizzle (pg-core/query-builders/select.d.ts:187)
// y es el fallback nombrado explícitamente por FB-GIST-NOT-CHOSEN
// ("restructure the query, e.g. innerJoinLateral") — nunca se relaja la
// aserción del plan para que pase.
//
// Medido: un JOIN LATERAL correlacionado por sí solo NO basta. Postgres
// intenta "aplanar" (pull up) cualquier subconsulta simple — LATERAL
// incluida — de vuelta al árbol de uniones del padre cuando puede, y
// entonces vuelve a reordenar libremente, produciendo el MISMO plan que
// sin LATERAL (confirmado con `toSQL()` + EXPLAIN reales, dos veces).
// `LIMIT`/`OFFSET` son la barrera de optimización clásica de Postgres:
// `is_simple_subquery` en el planificador rechaza aplanar una subconsulta
// que los tenga, sin importar el valor. Se probó primero `.offset(0)` — NO
// sirve: Drizzle 0.45.2 renderiza `offsetSql` con `offset ? ... : void 0`
// (pg-core/dialect.js:287), y `0` es falso en JS, así que la cláusula
// `OFFSET` nunca llega al SQL enviado a Postgres (verificado con
// `toSQL()`: no aparece "offset" en el texto). `limit` usa en cambio
// `limit >= 0` (dialect.js:286), sin ese defecto, así que un límite muy
// alto actúa como barrera real sin descartar ninguna fila — ningún grid de
// calibración se acerca a `Number.MAX_SAFE_INTEGER` pares candidatos.
//
// Esta subconsulta ES el único predicado compartido (A1 del diseño): tanto
// `buildCandidatePairsQuery` como `countCandidatePairs` la construyen igual.
//
// El tipo real de retorno es un genérico anidado de drizzle-orm
// (`PgSelect<...>` transformado por `.from()`/`.innerJoin()`/`.where()`/
// `.limit()`/`.as()`); anotarlo a mano sería frágil ante cambios de versión
// y no añade seguridad de tipos sobre lo que el compilador ya infiere
// correctamente — mismo motivo que `packages/db/src/schema/columns.ts:14-19`.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function pairCandidatesSubquery(db: Database, thresholds: BlockingThresholds) {
  const { priceBandCents, surfaceToleranceM2 } = thresholds;
  return db
    .select({
      listingBId: b.id,
      sourceBId: b.sourceId,
      coordinatesObfuscatedB: b.coordinatesObfuscated,
      locationGeographyB: b.locationGeography,
      priceCentsB: vb.priceCents,
      surfaceM2B: vb.surfaceM2,
    })
    .from(b)
    .innerJoin(vb, and(eq(vb.listingId, b.id), isCurrentHead(vb)))
    .where(
      and(
        // D-Q1: excluye auto-pares (`x < x` falso) y colapsa (A,B)/(B,A) a
        // la única fila donde `a.id` ordena primero. `listings.id` es
        // `uuid` (orden total de Postgres), determinista por ejecución.
        lt(a.id, b.id),
        // El predicado geográfico vive aquí, dentro de la subconsulta
        // correlacionada: es el único filtro sargable sobre `b` en este
        // bucle anidado forzado (FB-GIST-NOT-CHOSEN).
        rowsWithinMeters(a.locationGeography, b.locationGeography, thresholds.radiusMeters),
        // D-Q2: rango sobre la columna indexada (nunca `abs()`, que
        // enterraría la columna en una expresión y anularía el índice
        // parcial `listing_versions_price_surface_current_idx`).
        gte(vb.priceCents, sql`(${va.priceCents} - ${priceBandCents})`),
        lte(vb.priceCents, sql`(${va.priceCents} + ${priceBandCents})`),
        // D-Q3: NULL en cualquier lado rescata el par (un `BETWEEN` sobre
        // NULL evalúa a UNKNOWN bajo lógica trivaluada, indistinguible de
        // "fuera de margen"). La geometría NO se rescata: es la propia
        // clave de bloqueo, no un refinamiento.
        or(
          isNull(va.surfaceM2),
          isNull(vb.surfaceM2),
          and(
            gte(vb.surfaceM2, sql`(${va.surfaceM2} - ${surfaceToleranceM2})`),
            lte(vb.surfaceM2, sql`(${va.surfaceM2} + ${surfaceToleranceM2})`)
          )
        )
      )
    )
    .limit(Number.MAX_SAFE_INTEGER)
    .as('pair_candidates');
}

// Exportada (no interna) a propósito: CHK-PARTIAL-IDX y CHK-GIST-SELFJOIN
// necesitan inspeccionar `toSQL()`/`EXPLAIN` de la MISMA consulta que
// ejecuta `findCandidatePairs`, nunca una reescrita a mano para el test.
// Mismo motivo de disable que `pairCandidatesSubquery` (arriba).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildCandidatePairsQuery(db: Database, thresholds: BlockingThresholds) {
  const pairCandidates = pairCandidatesSubquery(db, thresholds);
  return db
    .select({
      listingAId: a.id,
      listingBId: pairCandidates.listingBId,
      sourceAId: a.sourceId,
      sourceBId: pairCandidates.sourceBId,
      // ST_Distance en la PROYECCIÓN, nunca en WHERE (D-Q4): en el
      // predicado, ST_DWithin es lo que el índice GiST puede servir.
      distanceMeters: sql<number>`ST_Distance(${a.locationGeography}, ${pairCandidates.locationGeographyB})`,
      // `::int` explícito: `abs(bigint - bigint)` devuelve bigint, y
      // node-postgres representa int8 como cadena por defecto (pérdida de
      // precisión, no aplica aquí — los precios reales caben en int4).
      priceDeltaCents: sql<number>`abs(${va.priceCents} - ${pairCandidates.priceCentsB})::int`,
      surfaceDeltaM2: sql<number | null>`abs(${va.surfaceM2} - ${pairCandidates.surfaceM2B})`,
      coordinatesObfuscatedA: a.coordinatesObfuscated,
      coordinatesObfuscatedB: pairCandidates.coordinatesObfuscatedB,
    })
    .from(a)
    .innerJoin(va, and(eq(va.listingId, a.id), isCurrentHead(va)))
    .innerJoinLateral(pairCandidates, sql`true`);
}

export async function findCandidatePairs(
  db: Database,
  thresholds: BlockingThresholds
): Promise<CandidatePair[]> {
  return buildCandidatePairsQuery(db, thresholds);
}

export interface CandidatePairCounts {
  readonly total: number;
  readonly withMissingSurface: number;
  readonly neitherObfuscated: number;
  readonly oneObfuscated: number;
  readonly bothObfuscated: number;
}

// D-C2: varias proyecciones de UN predicado evaluado una vez
// (`count(*) filter (where …)`), no una fusión de varias combinaciones de
// umbrales — D4 (una consulta por combinación) no se reabre.
export async function countCandidatePairs(
  db: Database,
  thresholds: BlockingThresholds
): Promise<CandidatePairCounts> {
  const pairCandidates = pairCandidatesSubquery(db, thresholds);
  const missingSurface = or(isNull(va.surfaceM2), isNull(pairCandidates.surfaceM2B));
  const neitherObfuscated = and(
    eq(a.coordinatesObfuscated, false),
    eq(pairCandidates.coordinatesObfuscatedB, false)
  );
  const bothObfuscated = and(
    eq(a.coordinatesObfuscated, true),
    eq(pairCandidates.coordinatesObfuscatedB, true)
  );
  const oneObfuscated = and(
    or(eq(a.coordinatesObfuscated, true), eq(pairCandidates.coordinatesObfuscatedB, true)),
    or(eq(a.coordinatesObfuscated, false), eq(pairCandidates.coordinatesObfuscatedB, false))
  );

  const [row] = await db
    .select({
      total: count(),
      withMissingSurface: sql<number>`count(*) filter (where ${missingSurface})`.mapWith(Number),
      neitherObfuscated: sql<number>`count(*) filter (where ${neitherObfuscated})`.mapWith(Number),
      oneObfuscated: sql<number>`count(*) filter (where ${oneObfuscated})`.mapWith(Number),
      bothObfuscated: sql<number>`count(*) filter (where ${bothObfuscated})`.mapWith(Number),
    })
    .from(a)
    .innerJoin(va, and(eq(va.listingId, a.id), isCurrentHead(va)))
    .innerJoinLateral(pairCandidates, sql`true`);

  if (!row) {
    throw new Error('countCandidatePairs no devolvió ninguna fila de agregación.');
  }
  return row;
}

export interface CorpusSummary {
  readonly listings: number;
  readonly withGeometry: number;
  readonly obfuscated: number;
  readonly currentVersions: number;
  readonly currentWithSurface: number;
}

// D-C3: se ejecuta UNA vez por invocación de la CLI de calibración, no por
// combinación de umbrales — es la atribución permanente que responde "¿es
// el conteo enorme o cero por falta de geometría, ofuscación o umbrales
// demasiado estrictos?" (criterio de revisión propio de ROADMAP 1.8).
export async function corpusSummary(db: Database): Promise<CorpusSummary> {
  const [listingsRow] = await db
    .select({
      listings: count(),
      withGeometry: count(listings.locationGeography),
      obfuscated: sql<number>`count(*) filter (where ${listings.coordinatesObfuscated})`.mapWith(Number),
    })
    .from(listings);
  const [versionsRow] = await db
    .select({
      currentVersions: count(),
      currentWithSurface: count(listingVersions.surfaceM2),
    })
    .from(listingVersions)
    .where(sql`${listingVersions.isCurrent}`);

  if (!listingsRow || !versionsRow) {
    throw new Error('corpusSummary no devolvió ninguna fila de agregación.');
  }
  return { ...listingsRow, ...versionsRow };
}

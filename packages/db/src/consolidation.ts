// ROADMAP 1.10 (diseño D5, D6, D8) — escribe el resultado de un reproceso de
// deduplicación en UNA transacción: primero la cabecera de la corrida y la
// evidencia COMPLETA por par (ledger, nunca se borra — docs/DECISIONS.md,
// decisión 055), y solo después la reconstrucción entera de la caché
// `properties`/`property_listings` (se borra y se recrea cada corrida, Q6).
// Un fallo a mitad deja la base exactamente como estaba antes de llamar:
// ni caché a medio reconstruir ni evidencia huérfana (D8).
//
// packages/db mantiene Zod fuera de su runtime (docs/DECISIONS.md, decisión
// 023): `SimilarityBand` se importa aquí SOLO como `import type` — un
// import en tiempo de ejecución del barril de `@buscahogar/core`
// arrastraría `listingSchema` (Zod) consigo, aunque este fichero nunca use
// esa exportación en concreto (mismo razonamiento que `hydration.ts`).
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SimilarityBand } from '@buscahogar/core';
import type { Database } from './db.js';
import type { SignalBreakdown } from './types.js';
import {
  dedupPairEvidence,
  dedupRuns,
  listingVersions,
  listings,
  properties,
  propertyListings,
} from './tables.js';
import { refreshPropertyVisibility } from './visibility.js';

// Marcador de peso 0 para un listing sin duplicado detectado (D6): mismo
// idioma ya establecido por `weights.ts`/`strategy.ts`/`classify.ts` en
// packages/core (peso 0 = "presente, no contribuye"), no una invención de
// este fichero.
const SELF_GROUP_SIGNALS: SignalBreakdown = {
  selfGroup: {
    value: 1,
    weight: 0,
    detail: 'vivienda sin duplicado detectado: grupo de un solo anuncio',
  },
};

export class WriteConsolidationError extends Error {}

export interface ConsolidationPairInput {
  // Invariante heredada del bloqueo (`blocking.ts:97`) y hecha estructural
  // por el CHECK `dedup_pair_evidence_listing_order_check`: listingAId <
  // listingBId. No se reordena aquí: si se viola, el INSERT falla y la
  // transacción entera revierte (D8) — el fallo audible correcto.
  readonly listingAId: string;
  readonly listingBId: string;
  readonly band: SimilarityBand;
  readonly score: number;
  readonly signals: SignalBreakdown;
  readonly scoredListingVersionIdA?: string;
  readonly scoredListingVersionIdB?: string;
}

export interface ConsolidationGroupInput {
  // Ya viene de `buildPropertyGroups` (packages/core, D3): incluye tanto
  // un grupo real de varios miembros como un singleton (sin duplicado, o
  // miembro de un componente rechazado, D2) — ambos casos reciben
  // exactamente el mismo tratamiento aquí.
  readonly listingIds: readonly string[];
  // Ya viene de `selectWinningListing` (packages/core, D4); para un
  // singleton es trivialmente el propio listing.
  readonly winnerId: string;
}

export interface ConsolidationInput {
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly radiusMeters: number;
  readonly priceBandCents: number;
  readonly surfaceToleranceM2: number;
  readonly listingsConsidered: number;
  // TODOS los pares clasificados de la corrida, accept/undecided/reject por
  // igual (EVID-1, Q7) — no solo los que acabaron formando un grupo.
  readonly pairs: readonly ConsolidationPairInput[];
  readonly groups: readonly ConsolidationGroupInput[];
  readonly refusedComponentsCount: number;
}

export interface ConsolidationOutcome {
  readonly runId: string;
  readonly propertiesCreated: number;
  readonly startedAt: Date;
}

export async function writeConsolidation(
  db: Database,
  input: ConsolidationInput
): Promise<ConsolidationOutcome> {
  return db.transaction(async (tx) => {
    async function fetchWinnerAttributes(winnerId: string): Promise<{
      locationId: string | null;
      location: { x: number; y: number } | null;
      propertyType: string | null;
      operation: string;
      address: string | null;
      bathrooms: number | null;
      floor: string | null;
      title: string | null;
      description: string | null;
      surfaceM2: number | null;
      rooms: number | null;
      currentVersionId: string;
      thumbnailUrl: string | null;
    }> {
      const [row] = await tx
        .select({
          locationId: listings.locationId,
          location: listings.location,
          // ROADMAP 1.11 — mismo join ya existente para locationId/location,
          // sin join nuevo (docs/DECISIONS.md, decisión 059).
          thumbnailUrl: listings.thumbnailUrl,
          propertyType: listingVersions.propertyType,
          operation: listingVersions.operation,
          address: listingVersions.address,
          bathrooms: listingVersions.bathrooms,
          floor: listingVersions.floor,
          title: listingVersions.title,
          description: listingVersions.description,
          surfaceM2: listingVersions.surfaceM2,
          rooms: listingVersions.rooms,
          currentVersionId: listingVersions.id,
        })
        .from(listings)
        .innerJoin(
          listingVersions,
          and(eq(listingVersions.listingId, listings.id), sql`${listingVersions.isCurrent}`)
        )
        .where(eq(listings.id, winnerId));

      if (!row) {
        throw new WriteConsolidationError(
          `writeConsolidation: no se encontró la versión vigente del listing ganador "${winnerId}".`
        );
      }
      return row;
    }

    // ROADMAP 2.5 (decisión 109): este mínimo (sobre TODO el grupo, activos o
    // no) es solo el valor inicial de la fila. El paso 7 lo sobrescribe con
    // `refreshPropertyVisibility`, que lo calcula entre los anuncios ACTIVOS
    // (y solo cae al de todos si ninguno lo está).
    // D5: el precio consolidado es el MÍNIMO de las versiones VIGENTES de
    // TODO el grupo, deliberadamente no el del ganador (A5) — suelen ser
    // listings distintos. `::int` explícito por el mismo motivo que
    // `blocking.ts:144` (priceDeltaCents): MIN(bigint) devuelve bigint, y
    // node-postgres representa int8 como cadena por defecto; los precios
    // reales caben sobradamente en int4.
    async function fetchGroupMinPriceCents(memberIds: readonly string[]): Promise<number> {
      // `number | null`, no solo `number`: MIN() sobre cero filas (un
      // `memberIds` que no casase con ninguna versión vigente) devuelve
      // SQL NULL de verdad — el tipo debe reflejarlo para que la
      // comprobación de abajo sea real, no un chequeo contra un tipo que
      // el compilador ya descarta.
      const [row] = await tx
        .select({ minPriceCents: sql<number | null>`MIN(${listingVersions.priceCents})::int` })
        .from(listingVersions)
        .where(and(inArray(listingVersions.listingId, memberIds), sql`${listingVersions.isCurrent}`));

      if (!row || row.minPriceCents === null) {
        throw new WriteConsolidationError(
          `writeConsolidation: no se pudo calcular el precio mínimo del grupo (${memberIds.join(', ')}).`
        );
      }
      return row.minPriceCents;
    }

    // D6, fila de un miembro de un grupo de VARIOS integrantes: su arista
    // 'accept' de mayor puntuación hacia otro miembro DEL MISMO grupo,
    // desempatada por el id de la contraparte ASC. Un grupo de 1 nunca
    // llega aquí (rama singleton en `buildPropertyListingsRows`). El
    // filtro `memberIds.has(counterpartId)` es defensivo: por construcción
    // de `buildPropertyGroups` (packages/core) toda arista 'accept' de un
    // miembro de un grupo de varios apunta a otro miembro del MISMO grupo.
    function selectBestAcceptEdge(
      listingId: string,
      memberIds: ReadonlySet<string>
    ): { edge: ConsolidationPairInput; counterpartId: string } {
      let best: { edge: ConsolidationPairInput; counterpartId: string } | undefined;
      for (const pair of input.pairs) {
        if (pair.band !== 'accept') {
          continue;
        }
        if (pair.listingAId !== listingId && pair.listingBId !== listingId) {
          continue;
        }
        const counterpartId = pair.listingAId === listingId ? pair.listingBId : pair.listingAId;
        if (!memberIds.has(counterpartId)) {
          continue;
        }
        if (
          !best ||
          pair.score > best.edge.score ||
          (pair.score === best.edge.score && counterpartId < best.counterpartId)
        ) {
          best = { edge: pair, counterpartId };
        }
      }
      if (!best) {
        throw new WriteConsolidationError(
          `writeConsolidation: el listing "${listingId}" no tiene ninguna arista 'accept' hacia su ` +
            'propio grupo — un grupo de más de un miembro exige al menos una (invariante de ' +
            'buildPropertyGroups, packages/core).'
        );
      }
      return best;
    }

    function buildPropertyListingsRows(
      group: ConsolidationGroupInput,
      winnerCurrentVersionId: string,
      propertyId: string
    ): (typeof propertyListings.$inferInsert)[] {
      if (group.listingIds.length === 1) {
        const [listingId] = group.listingIds;
        if (listingId === undefined) {
          throw new WriteConsolidationError('writeConsolidation: grupo singleton sin listingId.');
        }
        // Singleton (D6): score 1.0, marcador selfGroup a peso 0 — sin
        // aristas que consultar, su versión vigente es siempre la del
        // propio ganador (el ganador de un grupo de 1 es él mismo).
        return [
          {
            propertyId,
            listingId,
            score: 1,
            strategyName: input.strategyName,
            strategyVersion: input.strategyVersion,
            signals: SELF_GROUP_SIGNALS,
            scoredListingVersionId: winnerCurrentVersionId,
          },
        ];
      }

      const memberIds = new Set(group.listingIds);
      return group.listingIds.map((listingId) => {
        const { edge } = selectBestAcceptEdge(listingId, memberIds);
        const scoredListingVersionId =
          listingId === edge.listingAId ? edge.scoredListingVersionIdA : edge.scoredListingVersionIdB;
        return {
          propertyId,
          listingId,
          score: edge.score,
          strategyName: input.strategyName,
          strategyVersion: input.strategyVersion,
          signals: edge.signals,
          ...(scoredListingVersionId !== undefined ? { scoredListingVersionId } : {}),
        };
      });
    }

    // Paso 1: cabecera de la corrida (D1) — nunca se borra, ni siquiera
    // cuando la corrida siguiente reconstruye la caché entera.
    const acceptPairs = input.pairs.filter((pair) => pair.band === 'accept').length;
    const undecidedPairs = input.pairs.filter((pair) => pair.band === 'undecided').length;
    const rejectPairs = input.pairs.filter((pair) => pair.band === 'reject').length;

    const [run] = await tx
      .insert(dedupRuns)
      .values({
        strategyName: input.strategyName,
        strategyVersion: input.strategyVersion,
        radiusMeters: input.radiusMeters,
        priceBandCents: input.priceBandCents,
        surfaceToleranceM2: input.surfaceToleranceM2,
        listingsConsidered: input.listingsConsidered,
        candidatePairs: input.pairs.length,
        acceptPairs,
        undecidedPairs,
        rejectPairs,
        propertiesCreated: input.groups.length,
        refusedComponents: input.refusedComponentsCount,
      })
      .returning({ id: dedupRuns.id, startedAt: dedupRuns.startedAt });

    if (!run) {
      throw new WriteConsolidationError('writeConsolidation: no se pudo insertar la cabecera de dedup_runs.');
    }

    // Paso 2: evidencia COMPLETA de cada par, accept/undecided/reject por
    // igual (EVID-1, Q7) — tampoco se borra nunca.
    if (input.pairs.length > 0) {
      await tx.insert(dedupPairEvidence).values(
        input.pairs.map((pair) => ({
          runId: run.id,
          listingAId: pair.listingAId,
          listingBId: pair.listingBId,
          score: pair.score,
          signals: pair.signals,
          band: pair.band,
          ...(pair.scoredListingVersionIdA !== undefined
            ? { scoredListingVersionIdA: pair.scoredListingVersionIdA }
            : {}),
          ...(pair.scoredListingVersionIdB !== undefined
            ? { scoredListingVersionIdB: pair.scoredListingVersionIdB }
            : {}),
        }))
      );
    }

    // Pasos 3-4: se borra la caché ENTERA (Q6) — nunca la evidencia. Los
    // ids del paso 5 son nuevos a propósito (REPRO-3): no se garantiza su
    // estabilidad entre reprocesos.
    await tx.delete(propertyListings);
    await tx.delete(properties);

    // Pasos 5-6: una vivienda + sus enlaces por grupo, singletons incluidos
    // (D6, CONS-4, EVID-3) — ningún listing queda fuera.
    let propertiesCreated = 0;
    for (const group of input.groups) {
      const winner = await fetchWinnerAttributes(group.winnerId);
      const minPriceCents = await fetchGroupMinPriceCents(group.listingIds);

      const [propertyRow] = await tx
        .insert(properties)
        .values({
          locationId: winner.locationId,
          location: winner.location,
          thumbnailUrl: winner.thumbnailUrl,
          minPriceCents,
          surfaceM2: winner.surfaceM2,
          rooms: winner.rooms,
          propertyType: winner.propertyType,
          operation: winner.operation,
          address: winner.address,
          bathrooms: winner.bathrooms,
          floor: winner.floor,
          title: winner.title,
          description: winner.description,
          listingCount: group.listingIds.length,
          consolidatedAt: run.startedAt,
        })
        .returning({ id: properties.id });

      if (!propertyRow) {
        throw new WriteConsolidationError(
          `writeConsolidation: no se pudo insertar la vivienda consolidada del grupo (${group.listingIds.join(', ')}).`
        );
      }
      propertiesCreated += 1;

      const memberRows = buildPropertyListingsRows(group, winner.currentVersionId, propertyRow.id);
      await tx.insert(propertyListings).values(memberRows);
    }

    // Paso 7 (ROADMAP 2.5, decisión 109): caché de visibilidad. La caché entera
    // se acaba de reconstruir, así que se recalcula para todas las viviendas
    // (`active_listing_count` y precio mínimo solo de los anuncios activos) en
    // la MISMA transacción. La agrupación de arriba sigue siendo ajena al
    // estado (decisión 068): un anuncio inactivo es miembro del grupo igual.
    await refreshPropertyVisibility(tx, { all: true });

    return { runId: run.id, propertiesCreated, startedAt: run.startedAt };
  });
}

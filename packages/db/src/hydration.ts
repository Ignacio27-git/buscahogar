// ROADMAP 1.10 (diseño D7) — reconstruye un `Listing` de dominio a partir de
// filas persistidas, para alimentar `ruleBasedDedupStrategy`/
// `buildPropertyGroups`/`selectWinningListing` (packages/core) durante un
// reproceso. Ninguna función así existía todavía en el repositorio.
//
// DOS TRAMPAS, ya documentadas en el propio código del repositorio:
// 1. `Listing.sourceId` es la clave de DOMINIO (p. ej. 'idealista'), pero
//    `listings.sourceId` es el uuid de `sources.id` (FK). Solo existe la
//    dirección key→uuid (`apps/ingestion/src/sweep/reference-store.ts:33-39`);
//    esta función hace la inversa mediante un JOIN a `sources.key`
//    (`sources.ts:12`, único).
// 2. `listings.location` es `mode:'xy'`: x es LONGITUD, y es LATITUD
//    (`listings.ts:33-34`) — invertirlas pone España en el océano Índico.
//    `coordinatesSchema` es `{ latitude, longitude }`
//    (`area-query.schema.ts:9-12`).
//
// `…ForDedup` en el nombre es deliberado (D7): NO carga `features` (emite
// `[]`, válido por su `.default([])`) ni `location` (municipio/provincia;
// queda ausente, válido por su `.optional()`) porque ninguno de los dos lo
// lee `ruleBasedDedupStrategy` (`strategies/rule-based/strategy.ts:26-43`)
// ni `selectWinningListing` (D4). Un futuro llamador que necesite fidelidad
// completa no debe confundir esto con un hidratador general.
//
// Sin `listingSchema.parse`, deliberadamente: es una anotación de tipo
// (`import type`, se borra por completo en compilación), nunca una
// importación en tiempo de ejecución del barril de `@buscahogar/core` —
// esa SÍ arrastraría Zod (`listingSchema`) a la runtime de `packages/db`,
// aunque este fichero nunca la use (docs/DECISIONS.md, decisión 023;
// `types.ts:6-14`). Los dos `as` de abajo confían en las restricciones ya
// aplicadas por la base de datos sobre una fila YA persistida — no es
// entrada externa (decisión 023) — salvo por la ausencia de
// `propertyType`, que si no tiene CHECK de vocabulario y se comprueba
// explícitamente más abajo. Riesgo residual asumido y no oculto: un valor
// de `operation`/`propertyType` corrupto que sorteara esas restricciones
// no se detectaría aquí, solo por el test de ida y vuelta.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Listing, OperationType, PropertyType } from '@buscahogar/core';
import { chunkByBindParameters } from './bind-parameters.js';
import type { Database } from './db.js';
import { listingVersions, listings, sources } from './tables.js';

export class MissingPropertyTypeError extends Error {
  readonly listingId: string;

  constructor(listingId: string) {
    super(
      `listing_versions.property_type es NULL para el listing "${listingId}": Listing.propertyType ` +
        'es obligatorio (HYDRATE-2) y esa columna no tiene CHECK de vocabulario a nivel de base de datos.'
    );
    this.listingId = listingId;
  }
}

interface HydratedRow {
  readonly listingId: string;
  readonly sourceKey: string;
  readonly externalId: string;
  readonly url: string;
  readonly location: { x: number; y: number } | null;
  readonly operation: string;
  readonly propertyType: string | null;
  readonly priceCents: number;
  readonly surfaceM2: number | null;
  readonly rooms: number | null;
  readonly bathrooms: number | null;
  readonly floor: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly address: string | null;
}

export async function hydrateListingsForDedup(
  db: Database,
  listingIds: readonly string[]
): Promise<Map<string, Listing>> {
  // Por lotes de ids (decisión 247): el reproceso hidrata el corpus COMPLETO
  // y `inArray` liga un parámetro por id; por encima de 65 535 ids una sola
  // consulta desbordaría el tope de parámetros del protocolo (08P01).
  const result = new Map<string, Listing>();
  for (const batch of chunkByBindParameters(listingIds, 1)) {
    for (const row of await selectHydratedRows(db, batch)) {
      result.set(row.listingId, hydrateRow(row));
    }
  }
  return result;
}

async function selectHydratedRows(
  db: Database,
  listingIds: readonly string[]
): Promise<HydratedRow[]> {
  return db
    .select({
      listingId: listings.id,
      sourceKey: sources.key,
      externalId: listings.externalId,
      url: listings.url,
      location: listings.location,
      operation: listingVersions.operation,
      propertyType: listingVersions.propertyType,
      priceCents: listingVersions.priceCents,
      surfaceM2: listingVersions.surfaceM2,
      rooms: listingVersions.rooms,
      bathrooms: listingVersions.bathrooms,
      floor: listingVersions.floor,
      title: listingVersions.title,
      description: listingVersions.description,
      address: listingVersions.address,
    })
    .from(listings)
    .innerJoin(
      listingVersions,
      and(eq(listingVersions.listingId, listings.id), sql`${listingVersions.isCurrent}`)
    )
    .innerJoin(sources, eq(sources.id, listings.sourceId))
    .where(inArray(listings.id, listingIds));
}

function hydrateRow(row: HydratedRow): Listing {
  if (row.propertyType === null) {
    throw new MissingPropertyTypeError(row.listingId);
  }

  return {
    sourceId: row.sourceKey,
    externalId: row.externalId,
    url: row.url,
    // `operation` está garantizado 'sale'|'rent' por NOT NULL + CHECK
    // (`listing-versions.ts:69`); `propertyType` ya se comprobó no-NULL
    // arriba, y confiamos su valor por el mismo motivo (decisión 023).
    operation: row.operation as OperationType,
    propertyType: row.propertyType as PropertyType,
    priceCents: row.priceCents,
    // Cada campo opcional se omite del objeto si está ausente en la fila
    // (HYDRATE-2b) — nunca se escribe como `undefined` explícito ni como
    // un valor por defecto sintético.
    ...(row.surfaceM2 !== null ? { surfaceM2: row.surfaceM2 } : {}),
    ...(row.rooms !== null ? { rooms: row.rooms } : {}),
    ...(row.bathrooms !== null ? { bathrooms: row.bathrooms } : {}),
    ...(row.floor !== null ? { floor: row.floor } : {}),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.address !== null ? { address: row.address } : {}),
    ...(row.location !== null
      ? { coordinates: { longitude: row.location.x, latitude: row.location.y } }
      : {}),
    // …ForDedup (D7): `location` (municipio/provincia) deliberadamente
    // ausente; `features` siempre `[]`, válido por su `.default([])`.
    features: [],
  };
}

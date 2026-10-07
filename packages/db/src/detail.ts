// ROADMAP 1.12 (diseño D3; docs/DECISIONS.md, decisión 061) — dos consultas,
// no un único join (accepted cost: dos round-trips por vista de página).
// Sibling a `search.ts`: Zod-free (decisión 023), reexportado desde
// `src/index.ts`.
//
// Q1 (getPropertyDetailHeader): `property_listings` (único en `listingId`,
// `property-listings.ts:52`) ⋈ `properties` — la cabecera consolidada, o
// nada → la página llama `notFound()`.
// Q2 (getPropertySources): `property_listings` ⋈ `listings` ⋈
// `listing_versions` (`isCurrent`) ⋈ `sources` — una fila por anuncio de
// origen. NINGÚN predicado sobre `listings.status` en ninguna de las dos
// consultas (diseño Q1, verificado): un anuncio retirado (`status='removed'`
// o `'inactive'`) sigue en `property_listings` y su URL sigue resolviendo;
// `status` se PROYECTA para que la interfaz lo marque, nunca se filtra.
//
// `score`/`signals` de `property_listings` están AUSENTES de ambos tipos de
// retorno a propósito (PD-3): la frontera la impone el compilador, no la
// disciplina de la interfaz — ningún cambio en la UI puede filtrarlos sin
// editar este fichero primero.
import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from './db.js';
import { listingVersions, listings, properties, propertyListings, sources } from './tables.js';

export interface PropertyDetailHeader {
  readonly id: string;
  readonly minPriceCents: number | null;
  readonly listingCount: number;
  readonly thumbnailUrl: string | null;
  readonly propertyType: string | null;
  readonly operation: string | null;
  readonly surfaceM2: number | null;
  readonly rooms: number | null;
  readonly bathrooms: number | null;
  readonly floor: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly address: string | null;
}

export interface PropertyDetailSource {
  readonly listingId: string;
  readonly sourceKey: string;
  readonly url: string;
  readonly priceCents: number;
  readonly thumbnailUrl: string | null;
  readonly numPhotos: number | null;
  readonly status: string;
  readonly lastSeenAt: Date;
  readonly propertyType: string | null;
  readonly surfaceM2: number | null;
  readonly rooms: number | null;
  readonly bathrooms: number | null;
  readonly floor: string | null;
  readonly address: string | null;
}

// D.10 — una observación de precio: una fila por versión de anuncio. Solo
// estos cinco campos: ni `score`/`signals` ni el texto que el tombstone
// redacta (decisión 107), de modo que un anuncio retirado o redactado sigue
// aportando precio y fecha.
export interface PropertyPriceObservation {
  readonly sourceKey: string;
  readonly listingId: string;
  readonly status: string;
  readonly priceCents: number;
  readonly capturedAt: Date;
}

// Devuelve `undefined` cuando no hay ninguna fila `property_listings` para
// este `listingId` — cubre los tres casos de 404 no cubiertos ya por la
// validación Zod del parámetro (listing inexistente por completo, y el
// listing barrido tras el último `reprocess-dedup`, AR-2): un INNER JOIN
// desde `property_listings` no devuelve nada en ninguno de los dos.
export async function getPropertyDetailHeader(
  db: Database,
  listingId: string
): Promise<PropertyDetailHeader | undefined> {
  const [row] = await db
    .select({
      id: properties.id,
      minPriceCents: properties.minPriceCents,
      listingCount: properties.listingCount,
      thumbnailUrl: properties.thumbnailUrl,
      propertyType: properties.propertyType,
      operation: properties.operation,
      surfaceM2: properties.surfaceM2,
      rooms: properties.rooms,
      bathrooms: properties.bathrooms,
      floor: properties.floor,
      title: properties.title,
      description: properties.description,
      address: properties.address,
    })
    .from(propertyListings)
    .innerJoin(properties, eq(properties.id, propertyListings.propertyId))
    .where(eq(propertyListings.listingId, listingId));

  return row;
}

// Un miembro sin versión vigente no debería poder llegar aquí (invariante de
// `writeConsolidation`, siempre consolida desde una versión vigente), pero
// el `innerJoin` sobre `isCurrent` es la misma defensa en profundidad que ya
// aplica `hydration.ts:97-103` para el mismo join.
export async function getPropertySources(db: Database, propertyId: string): Promise<readonly PropertyDetailSource[]> {
  return db
    .select({
      listingId: listings.id,
      sourceKey: sources.key,
      url: listings.url,
      priceCents: listingVersions.priceCents,
      thumbnailUrl: listings.thumbnailUrl,
      numPhotos: listings.numPhotos,
      status: listings.status,
      lastSeenAt: listings.lastSeenAt,
      propertyType: listingVersions.propertyType,
      surfaceM2: listingVersions.surfaceM2,
      rooms: listingVersions.rooms,
      bathrooms: listingVersions.bathrooms,
      floor: listingVersions.floor,
      address: listingVersions.address,
    })
    .from(propertyListings)
    .innerJoin(listings, eq(listings.id, propertyListings.listingId))
    .innerJoin(
      listingVersions,
      and(eq(listingVersions.listingId, listings.id), sql`${listingVersions.isCurrent}`)
    )
    .innerJoin(sources, eq(sources.id, listings.sourceId))
    .where(eq(propertyListings.propertyId, propertyId))
    // Orden determinista (D.9): activos primero, luego precio y por último id,
    // para que la lista y la galería de la ficha compartan un único orden.
    .orderBy(sql`(${listings.status} = 'active') DESC`, asc(listingVersions.priceCents), asc(listings.id));
}

// D.10 — histórico de precios de la vivienda: TODAS las versiones de sus
// anuncios (sin filtrar por `isCurrent` ni por `status`), en una única
// sentencia. Orden determinista: `captured_at`, `version` e id del anuncio.
// Sin LIMIT: pocas versiones por vivienda y sin consulta a fuentes externas.
export async function getPropertyPriceHistory(
  db: Database,
  propertyId: string
): Promise<readonly PropertyPriceObservation[]> {
  return db
    .select({
      sourceKey: sources.key,
      listingId: listings.id,
      status: listings.status,
      priceCents: listingVersions.priceCents,
      capturedAt: listingVersions.capturedAt,
    })
    .from(propertyListings)
    .innerJoin(listings, eq(listings.id, propertyListings.listingId))
    .innerJoin(listingVersions, eq(listingVersions.listingId, listings.id))
    .innerJoin(sources, eq(sources.id, listings.sourceId))
    .where(eq(propertyListings.propertyId, propertyId))
    .orderBy(asc(listingVersions.capturedAt), asc(listingVersions.version), asc(listings.id));
}

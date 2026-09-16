// Ayudantes específicos de la suite de consolidación (ROADMAP 1.10). A
// diferencia de `test/helpers/fixtures.ts` (ROADMAP 1.8), aquí hace falta
// controlar cada campo de contenido opcional de `listing_versions`
// (propertyType, bathrooms, floor, title, description, address, rooms) y la
// clave de una fuente concreta, para poder probar hidratación (D7) y
// completitud (D4) con datos reales — `insertListingWithCurrentVersion` de
// 1.8 solo cubre precio y superficie.
import { randomUUID } from 'node:crypto';
import type { Database } from '../../src/db.js';
import { listings, listingVersions, sources } from '../../src/tables.js';

export async function insertSourceWithKey(db: Database, key: string): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key, name: key, kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error(`No se pudo insertar la fuente de prueba con key="${key}"`);
  }
  return source.id;
}

export interface FullListingOptions {
  readonly location?: { x: number; y: number };
  readonly operation?: 'sale' | 'rent';
  readonly propertyType?: string;
  readonly priceCents: number;
  readonly surfaceM2?: number;
  readonly rooms?: number;
  readonly bathrooms?: number;
  readonly floor?: string;
  readonly title?: string;
  readonly description?: string;
  readonly address?: string;
  readonly capturedAt?: Date;
}

// Inserta un anuncio y su versión vigente con control total sobre los
// campos de contenido opcionales — cada uno se omite del INSERT si no se
// pasa, en vez de escribirse como NULL explícito, para que la fila de
// partida sea indistinguible de "nunca se rellenó" (igual que haría un
// adaptador real que no recibió ese dato).
export async function insertListingWithVersion(
  db: Database,
  sourceId: string,
  options: FullListingOptions
): Promise<{ listingId: string; versionId: string }> {
  const [listing] = await db
    .insert(listings)
    .values({
      sourceId,
      externalId: `ext-${randomUUID()}`,
      url: 'https://example.test/anuncio',
      ...(options.location !== undefined ? { location: options.location } : {}),
    })
    .returning({ id: listings.id });
  if (!listing) {
    throw new Error('No se pudo insertar el anuncio de prueba');
  }

  const [version] = await db
    .insert(listingVersions)
    .values({
      listingId: listing.id,
      version: 1,
      isCurrent: true,
      priceCents: options.priceCents,
      operation: options.operation ?? 'sale',
      ...(options.propertyType !== undefined ? { propertyType: options.propertyType } : {}),
      ...(options.surfaceM2 !== undefined ? { surfaceM2: options.surfaceM2 } : {}),
      ...(options.rooms !== undefined ? { rooms: options.rooms } : {}),
      ...(options.bathrooms !== undefined ? { bathrooms: options.bathrooms } : {}),
      ...(options.floor !== undefined ? { floor: options.floor } : {}),
      ...(options.title !== undefined ? { title: options.title } : {}),
      ...(options.description !== undefined ? { description: options.description } : {}),
      ...(options.address !== undefined ? { address: options.address } : {}),
      ...(options.capturedAt !== undefined ? { capturedAt: options.capturedAt } : {}),
    })
    .returning({ id: listingVersions.id });
  if (!version) {
    throw new Error('No se pudo insertar la versión vigente del anuncio de prueba');
  }

  return { listingId: listing.id, versionId: version.id };
}

// Orienta un par según la misma invariante que el bloqueo (`blocking.ts:97`)
// y el CHECK `dedup_pair_evidence_listing_order_check`: el menor primero.
// Los ids son uuids generados por la base de datos, así que no se puede fijar
// el orden de antemano en el test — se calcula tras insertar.
export function orderPair(idX: string, idY: string): readonly [string, string] {
  return idX < idY ? [idX, idY] : [idY, idX];
}

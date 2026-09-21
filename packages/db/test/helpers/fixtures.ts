// Datos mínimos válidos para los tests de integración: solo cubren las
// columnas NOT NULL que cada tabla exige. Cada test añade por encima lo que
// necesite comprobar (versión, puntuación, ubicación...).
import { randomInt, randomUUID } from 'node:crypto';
import { normalizeSearchName } from '@buscahogar/core';
import type { Database } from '../../src/db.js';
import { listings, listingVersions, locations, sources } from '../../src/tables.js';

export async function insertSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `source-${randomUUID()}`, name: 'Fuente de prueba', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

export async function insertListing(
  db: Database,
  sourceId: string,
  overrides: Partial<typeof listings.$inferInsert> = {}
): Promise<string> {
  const [listing] = await db
    .insert(listings)
    .values({
      sourceId,
      externalId: `ext-${randomUUID()}`,
      url: 'https://example.test/anuncio',
      ...overrides,
    })
    .returning({ id: listings.id });
  if (!listing) {
    throw new Error('No se pudo insertar el anuncio de prueba');
  }
  return listing.id;
}

// ROADMAP 1.8 — `insertListing` (arriba) solo puebla columnas de identidad
// de `listings`; cada caso de bloqueo necesita además su versión vigente
// (`is_current = true`) con precio y superficie. Un único punto de
// inserción evita repetir en cada test las dos sentencias por separado.
// `location`/`status`/`coordinatesObfuscated` quedan opcionales porque solo
// algunos casos del bloqueo (p. ej. CBQ-3, CBQ-9) necesitan variarlos.
export async function insertListingWithCurrentVersion(
  db: Database,
  sourceId: string,
  options: {
    readonly location?: { x: number; y: number };
    readonly priceCents: number;
    readonly surfaceM2?: number | null;
    readonly status?: string;
    readonly coordinatesObfuscated?: boolean;
  }
): Promise<{ listingId: string; versionId: string }> {
  const listingId = await insertListing(db, sourceId, {
    ...(options.location !== undefined ? { location: options.location } : {}),
    ...(options.status !== undefined ? { status: options.status } : {}),
    ...(options.coordinatesObfuscated !== undefined
      ? { coordinatesObfuscated: options.coordinatesObfuscated }
      : {}),
  });

  const [version] = await db
    .insert(listingVersions)
    .values({
      listingId,
      version: 1,
      isCurrent: true,
      priceCents: options.priceCents,
      surfaceM2: options.surfaceM2 ?? null,
      operation: 'sale',
    })
    .returning({ id: listingVersions.id });
  if (!version) {
    throw new Error('No se pudo insertar la versión vigente del anuncio de prueba');
  }
  return { listingId, versionId: version.id };
}

export async function insertLocation(db: Database): Promise<string> {
  // ROADMAP 1.13 (DD-1): `ine_code` ahora lleva CHECK `^[0-9]{5}$`
  // (`locations_ine_code_check`), así que el identificador aleatorio de
  // este fixture ya no puede ser un fragmento de uuid — debe ser
  // exactamente 5 dígitos. `randomInt` de un rango amplio mantiene la
  // misma propiedad de unicidad práctica entre llamadas que tenía el
  // fragmento de uuid anterior.
  const ineCode = String(randomInt(10_000, 100_000));
  const [location] = await db
    .insert(locations)
    .values({
      ineCode,
      municipality: 'Madrid',
      province: 'Madrid',
      provinceCode: '28',
      autonomousCommunity: 'Comunidad de Madrid',
      searchName: normalizeSearchName('Madrid'),
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  return location.id;
}

// Datos mínimos válidos para los tests de integración: solo cubren las
// columnas NOT NULL que cada tabla exige. Cada test añade por encima lo que
// necesite comprobar (versión, puntuación, ubicación...).
import { randomUUID } from 'node:crypto';
import type { Database } from '../../src/db.js';
import { listings, locations, sources } from '../../src/tables.js';

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

export async function insertLocation(db: Database): Promise<string> {
  const ineCode = randomUUID().slice(0, 8);
  const [location] = await db
    .insert(locations)
    .values({
      ineCode,
      municipality: 'Madrid',
      province: 'Madrid',
      provinceCode: '28',
      autonomousCommunity: 'Comunidad de Madrid',
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  return location.id;
}

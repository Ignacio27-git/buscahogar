// Identidad estable de un anuncio: una fila por anuncio-y-fuente que nunca se
// sobrescribe (ver CLAUDE.md). Los cambios de precio o contenido viven en
// `listing_versions`, no aquí.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  boolean,
  check,
  geometry,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, geographyPoint, id } from './columns.js';
import { locations } from './locations.js';
import { sources } from './sources.js';

export const listings = pgTable(
  'listings',
  {
    id: id(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    // Identificador del anuncio en la fuente original; junto a `sourceId`
    // forma la clave natural del anuncio (ver índice único más abajo).
    externalId: text('external_id').notNull(),
    locationId: uuid('location_id').references(() => locations.id),
    url: text('url').notNull(),
    // `mode: 'xy'` expone `{ x, y }` donde x = longitud, y = latitud. Si se
    // invierten, los puntos de España aparecen en el océano Índico.
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
    // Columna generada STORED de tipo `geography`: es la que lleva el índice
    // GiST y la que usa `withinMeters()` (src/spatial.ts) para medir en
    // metros de verdad, no en los grados del SRS de `location`
    // (docs/DECISIONS.md, decisión 019).
    locationGeography: geographyPoint('location_geography').generatedAlwaysAs(
      (): SQL => sql`(${listings.location}::geography)`
    ),
    // Algunas fuentes ofuscan la coordenada exacta; esta marca lo hace
    // explícito para no tratar un radio de bloqueo amplio como un error.
    coordinatesObfuscated: boolean('coordinates_obfuscated').notNull().default(false),
    // ROADMAP 1.11 — identity-column (docs/DECISIONS.md, decisión 059): se
    // congela en la primera vista, igual que `url`/`location`. Nullable, sin
    // índice: no participa en ningún filtro ni bloqueo.
    thumbnailUrl: text('thumbnail_url'),
    status: text('status').notNull().default('active'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Clave natural del anuncio: una fuente nunca repite un mismo external_id.
    uniqueIndex('listings_source_external_id_idx').on(table.sourceId, table.externalId),
    index('listings_location_geography_idx').using('gist', table.locationGeography),
    index('listings_location_id_idx').on(table.locationId),
    check('listings_status_check', sql`${table.status} in ('active', 'inactive', 'removed')`),
  ]
);

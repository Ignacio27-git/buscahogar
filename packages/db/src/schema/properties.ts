// Vivienda canónica: agrupación de uno o varios `listings` que se refieren a
// la misma vivienda real (CLAUDE.md). Los campos consolidados son una caché
// recalculada al consolidar, nunca la fuente de verdad; el precio mostrado
// es siempre el más económico del grupo (docs/DECISIONS.md, decisión 006).
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  bigint,
  geometry,
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, geographyPoint, id } from './columns';
import { locations } from './locations';

export const properties = pgTable(
  'properties',
  {
    id: id(),
    locationId: uuid('location_id').references(() => locations.id),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
    // Mismo patrón de columna generada que `listings.locationGeography`: ver
    // el comentario allí para el porqué de `geography` + GiST en vez de un
    // cast en la propia consulta.
    locationGeography: geographyPoint('location_geography').generatedAlwaysAs(
      (): SQL => sql`(${properties.location}::geography)`
    ),
    minPriceCents: bigint('min_price_cents', { mode: 'number' }),
    surfaceM2: integer('surface_m2'),
    rooms: smallint('rooms'),
    listingCount: integer('listing_count').notNull().default(0),
    consolidatedAt: timestamp('consolidated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // La búsqueda filtra por radio contra esta tabla (ver ARCHITECTURE.md),
    // así que necesita el mismo tratamiento GiST que `listings`.
    index('properties_location_geography_idx').using('gist', table.locationGeography),
    index('properties_min_price_cents_idx').on(table.minPriceCents),
  ]
);

// Vivienda canónica: agrupación de uno o varios `listings` que se refieren a
// la misma vivienda real (CLAUDE.md). Los campos consolidados son una caché
// recalculada al consolidar, nunca la fuente de verdad; el precio mostrado
// es siempre el más económico del grupo (docs/DECISIONS.md, decisión 006).
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  bigint,
  check,
  geometry,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, geographyPoint, id } from './columns.js';
import { locations } from './locations.js';

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
    // ROADMAP 1.10: siete columnas de atributo consolidado, una caché
    // recalculada por `writeConsolidation()` en cada reproceso, nunca una
    // fuente de verdad independiente de los `listings` del grupo
    // (docs/DECISIONS.md, decisión 051). Todas nulables: `properties` no
    // tiene filas de producción hoy, pero `NOT NULL` fallaría contra
    // cualquier fila transitoria, mientras que nulable + CHECK es aditivo y
    // seguro (ver el CHECK de `operation` más abajo). En la práctica ambas
    // se escriben siempre, porque son enums obligatorios en `Listing` — la
    // nulabilidad es una propiedad de la migración, no una afirmación de
    // modelado.
    propertyType: text('property_type'),
    operation: text('operation'),
    address: text('address'),
    bathrooms: smallint('bathrooms'),
    floor: text('floor'),
    title: text('title'),
    description: text('description'),
    // ROADMAP 1.11 — proyectada desde el `listings.thumbnail_url` del
    // listing ganador (docs/DECISIONS.md, decisión 059); mismo tratamiento
    // de caché recalculada que las siete columnas de atributo de arriba.
    thumbnailUrl: text('thumbnail_url'),
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
    // Igual que `listings_status_check` (`listings.ts:57`): pasa con NULL,
    // así que no bloquea una fila todavía sin consolidar. Sin CHECK sobre
    // `property_type`: `listing_versions.property_type` tampoco lo tiene.
    check('properties_operation_check', sql`${table.operation} in ('sale', 'rent')`),
    // Un solo índice, no siete: sirve `operation` sola (como prefijo de este
    // compuesto) y ambas columnas juntas — los dos filtros de baja
    // cardinalidad que toda búsqueda de ROADMAP 1.11 aplicará. Los índices
    // por filtro adicionales se difieren deliberadamente a 1.11, que es
    // quien conoce las formas de consulta reales (docs/DECISIONS.md,
    // decisión 051).
    index('properties_operation_property_type_idx').on(table.operation, table.propertyType),
  ]
);

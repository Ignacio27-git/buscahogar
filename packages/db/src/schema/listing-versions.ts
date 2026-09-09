// Instantánea de precio y contenido de un anuncio en un momento dado. Nunca
// se actualiza en el sitio: un cambio de precio inserta una fila nueva
// (CLAUDE.md). `isCurrent` marca la cabeza de la serie; el índice único
// parcial de más abajo es lo que garantiza que solo puede haber una cabeza
// por anuncio (REQ-SCHEMA-03), no código de aplicación.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns';
import { listings } from './listings';

export const listingVersions = pgTable(
  'listing_versions',
  {
    id: id(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    // `mode: 'number'` (CHK-BIGINT-MODE): un precio en céntimos de una
    // vivienda cabe sobradamente en un entero seguro de JS (< 2^53), y evita
    // manejar `bigint` de JS en toda la capa de dominio para un rango que
    // nunca lo necesita.
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    surfaceM2: integer('surface_m2'),
    rooms: smallint('rooms'),
    bathrooms: smallint('bathrooms'),
    floor: text('floor'),
    title: text('title'),
    description: text('description'),
    // Dirección exacta: señal fuerte de deduplicación solo cuando coincide
    // literalmente (docs/CLAUDE.md). Vive en la versión, no en la identidad,
    // porque es contenido del anuncio y puede cambiar entre versiones.
    address: text('address'),
    propertyType: text('property_type'),
    operation: text('operation').notNull(),
    // Payload crudo de la fuente en el momento de la captura: permite
    // reprocesar la normalización o la deduplicación sin volver a gastar
    // cuota de la API (CLAUDE.md).
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('listing_versions_listing_id_version_idx').on(table.listingId, table.version),
    // Guarda de cabeza: como mucho una fila `is_current = true` por anuncio.
    uniqueIndex('listing_versions_current_idx')
      .on(table.listingId)
      .where(sql`${table.isCurrent}`),
    index('listing_versions_listing_captured_idx').on(table.listingId, table.capturedAt),
    // Índice parcial que usa el bloqueo de deduplicación (banda de precio y
    // margen de superficie), solo sobre la versión vigente de cada anuncio.
    index('listing_versions_price_surface_current_idx')
      .on(table.priceCents, table.surfaceM2)
      .where(sql`${table.isCurrent}`),
    check('listing_versions_operation_check', sql`${table.operation} in ('sale', 'rent')`),
  ]
);

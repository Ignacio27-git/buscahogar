// Tabla de evidencia: guarda la puntuación, la estrategia que la produjo y
// el desglose completo por señal de cada decisión de deduplicación
// (CLAUDE.md), no solo el resultado final. `scoredListingVersionId` deja
// registrada qué instantánea concreta se puntuó, sin que la relación se
// mueva cuando el anuncio recibe una versión nueva (docs/DECISIONS.md,
// decisión 018).
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SignalBreakdown } from '../types';
import { id } from './columns';
import { listingVersions } from './listing-versions';
import { listings } from './listings';
import { properties } from './properties';

export const propertyListings = pgTable(
  'property_listings',
  {
    id: id(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    // FK a la IDENTIDAD del anuncio, nunca a una versión: una versión nueva
    // no debe invalidar una decisión ya tomada (REQ-SCHEMA-05). La unicidad
    // se declara como índice nombrado más abajo, no como `.unique()` en
    // línea, para que quede documentada junto al resto de índices.
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    strategyName: text('strategy_name').notNull(),
    strategyVersion: text('strategy_version').notNull(),
    signals: jsonb('signals').$type<SignalBreakdown>().notNull(),
    // Qué instantánea de `listing_versions` se puntuó exactamente; nulable
    // porque una decisión histórica puede perder ese rastro si la versión
    // usada se elimina (`ON DELETE SET NULL`), sin que eso invalide la
    // decisión misma (docs/DECISIONS.md, decisión 018).
    scoredListingVersionId: uuid('scored_listing_version_id').references(() => listingVersions.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // REQ-SCHEMA-06: un anuncio, como mucho, una vivienda canónica.
    uniqueIndex('property_listings_listing_id_idx').on(table.listingId),
    index('property_listings_property_id_idx').on(table.propertyId),
    index('property_listings_signals_idx').using('gin', table.signals.op('jsonb_ops')),
    index('property_listings_strategy_idx').on(table.strategyName, table.strategyVersion),
  ]
);

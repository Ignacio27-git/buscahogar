// Comodidades presentes en una versión concreta de un anuncio. Se une a la
// versión, no a la identidad: una versión es una foto completa del anuncio
// (ver `listing_versions`), así que sus comodidades viajan con ella.
import { index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { features } from './features';
import { listingVersions } from './listing-versions';

export const listingFeatures = pgTable(
  'listing_features',
  {
    listingVersionId: uuid('listing_version_id')
      .notNull()
      .references(() => listingVersions.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id),
    // Valor de la comodidad cuando aplica (p. ej. superficie de una terraza);
    // nulo para comodidades binarias (p. ej. "ascensor").
    value: text('value'),
  },
  (table) => [
    primaryKey({ columns: [table.listingVersionId, table.featureId] }),
    index('listing_features_feature_id_idx').on(table.featureId),
  ]
);

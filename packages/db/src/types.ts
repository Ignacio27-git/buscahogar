// Tipos compartidos del esquema, sin `any`. `SignalBreakdown` es la
// evidencia completa de una decisión de deduplicación (CLAUDE.md): se
// guarda entera, no solo la decisión final, porque no se puede reconstruir
// después.
import type { listingFeatures } from './schema/listing-features';
import type { listingVersions } from './schema/listing-versions';
import type { listings } from './schema/listings';
import type { properties } from './schema/properties';
import type { propertyListings } from './schema/property-listings';

// Una señal individual considerada por una `DedupStrategy`: su valor
// normalizado, el peso que tuvo en la puntuación final y un detalle legible
// opcional (p. ej. "misma dirección exacta").
export interface SignalScore {
  readonly value: number;
  readonly weight: number;
  readonly detail?: string;
}

// Desglose completo por señal de una puntuación, no solo el resultado
// agregado (ver `property_listings.signals`).
export type SignalBreakdown = Readonly<Record<string, SignalScore>>;

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;

export type ListingVersion = typeof listingVersions.$inferSelect;
export type NewListingVersion = typeof listingVersions.$inferInsert;

export type ListingFeature = typeof listingFeatures.$inferSelect;
export type NewListingFeature = typeof listingFeatures.$inferInsert;

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

export type PropertyListing = typeof propertyListings.$inferSelect;
export type NewPropertyListing = typeof propertyListings.$inferInsert;

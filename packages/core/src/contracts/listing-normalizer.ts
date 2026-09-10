import type { Listing } from '../schemas/listing.schema.js';

// Traduce el payload crudo de una fuente (`T`) al Listing normalizado.
// Nunca al revés: core no conoce la forma de ninguna fuente concreta.
export interface ListingNormalizer<T> {
  normalize(raw: T): Listing;
}

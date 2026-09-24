// Tipos compartidos del esquema, sin `any`. `SignalBreakdown` es la
// evidencia completa de una decisión de deduplicación (CLAUDE.md): se
// guarda entera, no solo la decisión final, porque no se puede reconstruir
// después.
//
// `SignalScore`/`SignalBreakdown` ya no se declaran a mano aquí: proceden
// de `@buscahogar/core` (ROADMAP 1.4), que ahora es dominio compartido en
// vez de una dependencia declarada y dormida. `export type` es una
// reexportación puramente de tipos, erasable por completo en tiempo de
// compilación — no introduce ninguna dependencia real en runtime, así que
// la decisión 023 (sin Zod dentro de packages/db) sigue intacta. La forma
// es byte-idéntica a la que sustituye, así que `propertyListings.$inferSelect`
// no cambia (docs/DECISIONS.md, decisión 031).
export type { SignalBreakdown, SignalScore } from '@buscahogar/core';

import type { dedupPairEvidence } from './schema/dedup-pair-evidence.js';
import type { dedupRuns } from './schema/dedup-runs.js';
import type { listingFeatures } from './schema/listing-features.js';
import type { listingVersions } from './schema/listing-versions.js';
import type { listings } from './schema/listings.js';
import type { properties } from './schema/properties.js';
import type { propertyListings } from './schema/property-listings.js';

// Sufijo `Row` en toda la familia: `@buscahogar/core` (ROADMAP 1.4) ya
// exporta un `Listing` de dominio, y `docs/ARCHITECTURE.md` fija ese nombre
// para el dominio en las tres interfaces de contratos. Este paquete es el
// que colisiona, así que es el que renombra (docs/DECISIONS.md, decisión
// 031). El resto de la familia se renombra igual por consistencia interna,
// aunque solo `Listing`/`NewListing` colisionaban de verdad.
export type ListingRow = typeof listings.$inferSelect;
export type NewListingRow = typeof listings.$inferInsert;

export type ListingVersionRow = typeof listingVersions.$inferSelect;
export type NewListingVersionRow = typeof listingVersions.$inferInsert;

export type ListingFeatureRow = typeof listingFeatures.$inferSelect;
export type NewListingFeatureRow = typeof listingFeatures.$inferInsert;

export type PropertyRow = typeof properties.$inferSelect;
export type NewPropertyRow = typeof properties.$inferInsert;

export type PropertyListingRow = typeof propertyListings.$inferSelect;
export type NewPropertyListingRow = typeof propertyListings.$inferInsert;

export type DedupRunRow = typeof dedupRuns.$inferSelect;
export type NewDedupRunRow = typeof dedupRuns.$inferInsert;

export type DedupPairEvidenceRow = typeof dedupPairEvidence.$inferSelect;
export type NewDedupPairEvidenceRow = typeof dedupPairEvidence.$inferInsert;

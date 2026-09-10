import type { Listing } from '../schemas/listing.schema.js';
import type { SimilarityResult } from '../types/similarity.js';

// Estrategia de deduplicación intercambiable (ROADMAP 1.9+ aporta las
// implementaciones concretas; este paso solo fija el contrato).
export interface DedupStrategy {
  readonly name: string;
  // `version` acompaña a `name` porque property_listings.strategy_version es
  // NOT NULL y no existe otra fuente de dominio para ese valor (decisión
  // 020). Sin este campo, persistir la versión de la estrategia obligaría a
  // inventar el dato fuera del contrato de dominio.
  readonly version: string;
  score(a: Listing, b: Listing): SimilarityResult;
}

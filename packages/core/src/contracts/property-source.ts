import type { AreaQuery } from '../schemas/area-query.schema.js';
import type { SourcePage } from '../types/source-page.js';

// Adaptador de una fuente concreta (Idealista, u otra futura). `T` es el
// payload crudo de esa fuente, nunca Listing — la normalización ocurre
// después, en ListingNormalizer<T>. El parámetro por defecto `= unknown`
// mantiene compilando el literal `Promise<SourcePage>` de
// docs/ARCHITECTURE.md sin argumento de tipo (gate decision, obs #84).
export interface PropertySource<T = unknown> {
  readonly id: string;
  fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage<T>>;
}

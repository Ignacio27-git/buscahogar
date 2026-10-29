// D.12 — comparación pura de los anuncios de origen de una vivienda. Aplica la
// regla de la decisión 109 (precio de la vivienda = el más económico de los
// anuncios activos; sin ninguno activo, el mínimo de todos) y señala qué
// anuncios fijan ese precio. Sin ORM ni Next: la entrada es estructural, como
// `PriceObservation`, y la fila de `getPropertySources` encaja sin conversión.

/** Un anuncio de origen, reducido a lo que la comparación necesita. */
export interface SourceListingSnapshot {
  readonly listingId: string;
  /** Solo el valor exacto `'active'` cuenta como activo (igual que el SQL). */
  readonly status: string;
  readonly priceCents: number;
  readonly lastSeenAt: Date;
}

export type SourceComparison =
  | { readonly mode: 'empty'; readonly highlightedIds: readonly [] }
  | {
      readonly mode: 'active' | 'none-active';
      readonly priceCents: number;
      readonly primaryId: string;
      readonly highlightedIds: readonly string[];
    };

const ACTIVE_STATUS = 'active';

// Más reciente primero; a igual fecha, el listingId menor. Comparar con `<` y
// no con `localeCompare` mantiene el orden independiente de la configuración
// regional.
function isBetterPrimary(candidate: SourceListingSnapshot, current: SourceListingSnapshot): boolean {
  const candidateTime = candidate.lastSeenAt.getTime();
  const currentTime = current.lastSeenAt.getTime();
  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  return candidate.listingId < current.listingId;
}

export function compareSourceListings(
  listings: readonly SourceListingSnapshot[]
): SourceComparison {
  if (listings.length === 0) {
    return { mode: 'empty', highlightedIds: [] };
  }

  const active = listings.filter((listing) => listing.status === ACTIVE_STATUS);
  const mode = active.length > 0 ? 'active' : 'none-active';
  const pool = mode === 'active' ? active : listings;

  const priceCents = Math.min(...pool.map((listing) => listing.priceCents));
  const cheapest = pool.filter((listing) => listing.priceCents === priceCents);

  const [first, ...rest] = cheapest;
  // `cheapest` nunca está vacío: el mínimo sale de `pool`, que no lo está.
  const primary = rest.reduce(
    (best, candidate) => (isBetterPrimary(candidate, best) ? candidate : best),
    first as SourceListingSnapshot
  );

  return {
    mode,
    priceCents,
    primaryId: primary.listingId,
    highlightedIds: cheapest.map((listing) => listing.listingId),
  };
}

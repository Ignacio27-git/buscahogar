// Catálogo abierto de amenities, no una unión cerrada: docs/DECISIONS.md,
// decisión 025. Un ascensor, una plaza de garaje o cualquier otra amenity se
// modelan como una entrada de este catálogo aplicada a un Listing concreto
// (`AppliedFeature`), nunca como un campo booleano de primer nivel — eso
// importaría el vocabulario de un portal concreto al dominio (ROADMAP 1.4,
// criterio de revisión).
export interface Feature {
  readonly key: string;
  readonly labelEs: string;
}

export interface AppliedFeature {
  readonly key: string;
  readonly value?: string;
}

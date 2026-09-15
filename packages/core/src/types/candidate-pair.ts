// ROADMAP 1.8 — un par de anuncios candidato a la misma vivienda, emitido
// por el bloqueo (packages/db/src/blocking.ts). Escrito a mano, no derivado
// con z.infer: lo produce nuestra propia consulta y nunca se parsea desde
// una entrada externa (convención mixta de este paquete, src/index.ts:19-25;
// mismo precedente que SimilarityResult, types/similarity.ts).
//
// Diagnóstico, no decisión (BT-2): CandidatePair no lleva ningún campo de
// aceptación/rechazo. El bloqueo solo propone pares; ROADMAP 1.9 decide.
export interface CandidatePair {
  readonly listingAId: string;
  readonly listingBId: string;
  // Expuestos siempre, nunca filtrados en el predicado (Q2 del pre-proposal):
  // un par del mismo sourceId sigue siendo un candidato válido.
  readonly sourceAId: string;
  readonly sourceBId: string;
  readonly distanceMeters: number;
  readonly priceDeltaCents: number;
  // null cuando alguno de los dos lados carece de surface_m2 (D-Q3): la
  // superficie rescata el par en vez de descartarlo bajo lógica trivaluada.
  readonly surfaceDeltaM2: number | null;
  // Dimensión de salida, nunca una rama del predicado (Q4 / obs #127: 0/50
  // filas ofuscadas en el corpus verificado).
  readonly coordinatesObfuscatedA: boolean;
  readonly coordinatesObfuscatedB: boolean;
}

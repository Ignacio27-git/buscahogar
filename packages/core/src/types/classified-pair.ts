// ROADMAP 1.10 — un CandidatePair ya puntuado y bandeado por una
// DedupStrategy (ruleBasedDedupStrategy.score + classify), consumido por
// buildPropertyGroups (consolidation/grouping.ts). Escrito a mano, no
// derivado con z.infer: mismo precedente que CandidatePair
// (types/candidate-pair.ts) — nunca se parsea desde una entrada externa,
// solo lo produce el propio pipeline de reproceso.
//
// Deliberadamente más estrecho que dedup_pair_evidence (packages/db): esta
// interfaz solo lleva lo que el algoritmo de agrupación PURO necesita para
// decidir (band, para el cierre transitivo y el chequeo de conflicto; score,
// por si un futuro desempate lo necesitara). El desglose completo por señal
// (SignalBreakdown) es responsabilidad de la capa de evidencia/persistencia,
// no de este tipo — mezclarlos aquí acoplaría un algoritmo puro a la forma
// de la tabla que lo consume.
import type { SimilarityBand } from '../strategies/rule-based/classify.js';

export interface ClassifiedPair {
  // Invariante heredada del bloqueo (blocking.ts:97): listingAId < listingBId.
  readonly listingAId: string;
  readonly listingBId: string;
  readonly band: SimilarityBand;
  readonly score: number;
}

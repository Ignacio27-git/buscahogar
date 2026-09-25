// Bandeado del lado del llamador para la estrategia probabilística
// (ROADMAP 2.2, decisión 087), mismo contrato que rule-based/classify.ts
// (BAND-4: función pura de SimilarityResult, nunca recibe los Listing).
import type { BandThresholds } from '../../schemas/band-thresholds.schema.js';
import type { SimilarityResult } from '../../types/similarity.js';
import { isVetoed, type SimilarityBand } from '../rule-based/classify.js';

// FS_T_HIGH=0.95: como mucho 5% de falsos positivos esperados entre accept
// (decisión 006). FS_T_LOW=0.50: el punto de Bayes (M=0 ⇔ score=0.5).
// SIN piso de evidencia — a diferencia de rule-based, la propia aritmética
// de M ya impide que dos campos opcionales fuertes por sí solos alcancen
// 0.95 (decisión 087; ver probabilistic-classify.test.ts para el
// razonamiento real, con price siempre evaluado).
export const FS_BAND_THRESHOLDS: BandThresholds = { high: 0.95, low: 0.5 };

// `thresholds` opcional, mismo contrato que `classify()` de rule-based
// (decisión 088): sin segundo argumento, usa los umbrales por defecto de
// FS. La CLI de comparación de estrategias (ROADMAP 2.2) aplica la MISMA
// rejilla de sweep a ambas estrategias pasando el mismo `thresholds` a las
// dos — el significado del score difiere entre estrategias, pero el
// mecanismo de bandeado es intercambiable.
export function classifyProbabilistic(
  result: SimilarityResult,
  thresholds: BandThresholds = FS_BAND_THRESHOLDS
): SimilarityBand {
  // Veto compartido con rule-based (decisión 088): mismo criterio binario,
  // nunca reinterpretado por estrategia.
  if (isVetoed(result.signals)) {
    return 'reject';
  }

  if (result.score <= thresholds.low) {
    return 'reject';
  }

  if (result.score >= thresholds.high) {
    return 'accept';
  }

  return 'undecided';
}

// classifyRuleBasedWithImage (ROADMAP 2.3, spec "Rule-Based Evidence Floor
// Excludes the Image Signal", decisión 094): reutiliza `classify()` de
// rule-based SIN modificarlo — producción no cambia — pero le oculta la
// clave `image` del desglose antes de bandear. El score SÍ conserva la
// contribución de la imagen (nunca se recalcula aquí); solo el PISO de
// evidencia (evaluatedSignals/effectiveWeight, dentro de `classify()`) deja
// de verla. Así una imagen strong puede subir un score que ya satisface el
// piso con señales estructuradas, pero nunca sustituye esa evidencia por sí
// sola (RDS-4).
import type { BandThresholds } from '../../schemas/band-thresholds.schema.js';
import type { SimilarityResult } from '../../types/similarity.js';
import { classify, type SimilarityBand } from '../rule-based/classify.js';

export function classifyRuleBasedWithImage(
  result: SimilarityResult,
  thresholds?: BandThresholds
): SimilarityBand {
  const structuredSignals = Object.fromEntries(
    Object.entries(result.signals).filter(([key]) => key !== 'image')
  );
  const structuredResult: SimilarityResult = { score: result.score, signals: structuredSignals };

  return thresholds === undefined
    ? classify(structuredResult)
    : classify(structuredResult, thresholds);
}

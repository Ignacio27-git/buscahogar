// Bandeado del lado del llamador (BAND-1..BAND-4, decisión 048). `classify`
// es una función PURA de `SimilarityResult` — nunca recibe los dos
// `Listing` originales (BAND-4), así que un resultado ya persistido puede
// re-clasificarse sin rehidratar nada (útil directamente para ROADMAP
// 1.10, y consistente con el precedente propose-don't-decide de
// `CandidatePair`, ROADMAP 1.8).
import type { BandThresholds } from '../../schemas/band-thresholds.schema.js';
import type { SignalBreakdown, SimilarityResult } from '../../types/similarity.js';
import { MIN_EFFECTIVE_WEIGHT, MIN_EVALUATED_SIGNALS, RULE_BASED_BAND_THRESHOLDS } from './weights.js';

export type SimilarityBand = 'accept' | 'undecided' | 'reject';

// Las dos claves de veto (BAND-3) — excluidas del piso de evidencia porque
// viven siempre a peso 0 y nunca son "evidencia acumulada", solo una
// puerta binaria.
const GATE_KEYS = new Set(['propertyTypeMatch', 'operationMatch']);

// Extraído en ROADMAP 2.2 (decisión 088) para que la estrategia
// probabilística (strategies/probabilistic/) comparta el MISMO criterio de
// veto que rule-based — el veto es un contrato compartido entre
// estrategias, nunca una regla que cada una reinterprete a su manera.
export function isVetoed(signals: SignalBreakdown): boolean {
  const propertyTypeMatch = signals['propertyTypeMatch'];
  const operationMatch = signals['operationMatch'];
  return propertyTypeMatch?.value === 0 || operationMatch?.value === 0;
}

// `thresholds` es un parámetro OPCIONAL usado solo por la evaluación offline
// (apps/ingestion, ROADMAP 2.2). Sin segundo argumento, el comportamiento es
// byte-idéntico al de antes de este cambio: producción (reprocess-core.ts)
// nunca pasa un segundo argumento, así que retunar los umbrales de
// producción sigue siendo un cambio de `version` (decisión 020/049), nunca
// un parámetro en tiempo de ejecución de producción — ver weights.ts:1-9.
export function classify(result: SimilarityResult, thresholds: BandThresholds = RULE_BASED_BAND_THRESHOLDS): SimilarityBand {
  // 1. Veto primero (BAND-2): un desacuerdo en propertyType u operation
  // fuerza reject sin importar el score acumulado, y nunca al revés.
  if (isVetoed(result.signals)) {
    return 'reject';
  }

  // 2. Umbral de rechazo, inclusivo.
  if (result.score <= thresholds.low) {
    return 'reject';
  }

  // 3. Piso de evidencia mínima (RDS-4, decisión 049): al menos
  // MIN_EVALUATED_SIGNALS señales acumuladas evaluadas (peso > 0, nunca las
  // claves de veto) Y al menos MIN_EFFECTIVE_WEIGHT de peso efectivo. Solo
  // puede empujar hacia `undecided`/`reject`, nunca producir un `accept`
  // que el score por sí solo no respaldara.
  let evaluatedSignals = 0;
  let effectiveWeight = 0;
  for (const [key, signal] of Object.entries(result.signals)) {
    if (GATE_KEYS.has(key)) {
      continue;
    }
    if (signal.weight > 0) {
      evaluatedSignals += 1;
      effectiveWeight += signal.weight;
    }
  }

  const floorSatisfied = evaluatedSignals >= MIN_EVALUATED_SIGNALS && effectiveWeight >= MIN_EFFECTIVE_WEIGHT;

  // 4. Umbral de aceptación, inclusivo, condicionado al piso.
  if (result.score >= thresholds.high && floorSatisfied) {
    return 'accept';
  }

  // 5. Toda ambigüedad resuelve hacia `undecided` (decisión 006: minimizar
  // falsos positivos).
  return 'undecided';
}

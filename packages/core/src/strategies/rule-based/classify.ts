// Bandeado del lado del llamador (BAND-1..BAND-4, decisión 048). `classify`
// es una función PURA de `SimilarityResult` — nunca recibe los dos
// `Listing` originales (BAND-4), así que un resultado ya persistido puede
// re-clasificarse sin rehidratar nada (útil directamente para ROADMAP
// 1.10, y consistente con el precedente propose-don't-decide de
// `CandidatePair`, ROADMAP 1.8).
import type { SimilarityResult } from '../../types/similarity.js';
import { MIN_EFFECTIVE_WEIGHT, MIN_EVALUATED_SIGNALS, T_HIGH, T_LOW } from './weights.js';

export type SimilarityBand = 'accept' | 'undecided' | 'reject';

// Las dos claves de veto (BAND-3) — excluidas del piso de evidencia porque
// viven siempre a peso 0 y nunca son "evidencia acumulada", solo una
// puerta binaria.
const GATE_KEYS = new Set(['propertyTypeMatch', 'operationMatch']);

export function classify(result: SimilarityResult): SimilarityBand {
  // 1. Veto primero (BAND-2): un desacuerdo en propertyType u operation
  // fuerza reject sin importar el score acumulado, y nunca al revés.
  const propertyTypeMatch = result.signals['propertyTypeMatch'];
  const operationMatch = result.signals['operationMatch'];
  if (propertyTypeMatch?.value === 0 || operationMatch?.value === 0) {
    return 'reject';
  }

  // 2. Umbral de rechazo, inclusivo.
  if (result.score <= T_LOW) {
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
  if (result.score >= T_HIGH && floorSatisfied) {
    return 'accept';
  }

  // 5. Toda ambigüedad resuelve hacia `undecided` (decisión 006: minimizar
  // falsos positivos).
  return 'undecided';
}

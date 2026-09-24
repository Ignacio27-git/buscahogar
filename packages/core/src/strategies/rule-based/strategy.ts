// La primera DedupStrategy (ROADMAP 1.9): acumula las nueve señales
// (siete estructuradas + dos puertas de veto) y normaliza por peso
// EFECTIVO, no por peso total configurado (decisión 049) — dividir por el
// total introduce un sesgo sistemático contra los pares `premises`, que
// nunca tienen `rooms`/`bathrooms` (RDS-3a).
//
// La estrategia NUNCA decide: solo acumula y reporta. El bandeado
// (accept/undecided/reject) es una interpretación del lado del llamador,
// implementada en classify.ts, consistente con el precedente de
// `CandidatePair` (ROADMAP 1.8): proponer, no decidir.
import type { DedupStrategy } from '../../contracts/dedup-strategy.js';
import type { Listing } from '../../schemas/listing.schema.js';
import type { SignalScore, SimilarityResult } from '../../types/similarity.js';
import { scoreAddress } from './address.js';
import { scoreBathrooms, scoreDistance, scorePrice, scoreRooms, scoreSurface } from './signals.js';
import { STRATEGY_VERSION } from './weights.js';

// Las dos claves de veto (BAND-3): siempre presentes, siempre a peso 0 —
// nunca entran en la acumulación ni en el piso de evidencia (RDS-3, RDS-4).
// `classify` deriva el veto de su `value`, no de una entidad de marcador
// separada.
function scoreGate(matches: boolean, matchDetail: string, mismatchDetail: string): SignalScore {
  return { value: matches ? 1 : 0, weight: 0, detail: matches ? matchDetail : mismatchDetail };
}

function score(a: Listing, b: Listing): SimilarityResult {
  const { addressExact, addressZone } = scoreAddress(a.address, b.address);

  const signals = {
    distance: scoreDistance(a.coordinates, b.coordinates),
    price: scorePrice(a.priceCents, b.priceCents),
    surface: scoreSurface(a.surfaceM2, b.surfaceM2),
    addressExact,
    addressZone,
    rooms: scoreRooms(a.rooms, b.rooms),
    bathrooms: scoreBathrooms(a.bathrooms, b.bathrooms),
    propertyTypeMatch: scoreGate(
      a.propertyType === b.propertyType,
      'mismo tipo de inmueble',
      'tipo de inmueble distinto'
    ),
    operationMatch: scoreGate(a.operation === b.operation, 'misma operación', 'operación distinta'),
  };

  const signalValues = Object.values(signals);
  const totalWeight = signalValues.reduce((sum, signal) => sum + signal.weight, 0);
  const weightedSum = signalValues.reduce((sum, signal) => sum + signal.value * signal.weight, 0);
  // W === 0 ⇒ score 0: sin ninguna evidencia acumulada, se rechaza por
  // ausencia — coherente con la prioridad de decisión 006 (minimizar falsos
  // positivos). En la práctica es inalcanzable: las dos claves de veto
  // siempre están presentes, aunque a peso 0.
  const scoreValue = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  return { score: scoreValue, signals };
}

export const ruleBasedDedupStrategy: DedupStrategy = {
  name: 'rule-based-structured',
  version: STRATEGY_VERSION,
  score,
};

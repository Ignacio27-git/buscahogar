// Segunda DedupStrategy (ROADMAP 2.2, decisión 085): Fellegi-Sunter con
// niveles graduados y m/u fijados a priori. `name`/`version` distintos de
// rule-based (decisión 028) para que ambas convivan en `property_listings`
// sin ambigüedad sobre qué estrategia produjo cada fila.
//
// M = PRIOR_LOG_ODDS + Σ bits(campo evaluado) — un campo ausente (weight 0)
// NO participa en la suma (decisión 086, MAR-exclude), nunca se sustituye
// por un valor negativo. `score = 1/(1+2^-M)`, forma numéricamente estable
// de 2^M/(1+2^M) (decisión 085).
//
// Las dos claves de veto (propertyType/operation) se calculan aquí igual
// que en rule-based (BAND-3): value 1/0 indica coincidencia, weight SIEMPRE
// 0, nunca entra en M. La DECISIÓN de veto la toma `classifyProbabilistic`
// (classify.ts), reutilizando `isVetoed` de rule-based (decisión 088:
// contrato de veto compartido entre estrategias) — `score()` solo acumula y
// reporta, nunca decide (mismo precedente que rule-based/strategy.ts).
import type { DedupStrategy } from '../../contracts/dedup-strategy.js';
import type { Listing } from '../../schemas/listing.schema.js';
import type { SignalScore, SimilarityResult } from '../../types/similarity.js';
import { levelAddress, levelBathrooms, levelDistance, levelPrice, levelRooms, levelSurface } from './levels.js';
import { PRIOR_LAMBDA, PRIOR_LOG_ODDS } from './parameters.js';

const STRATEGY_NAME = 'probabilistic-fellegi-sunter';
const STRATEGY_VERSION = '1.0.0';

function gate(matches: boolean, matchDetail: string, mismatchDetail: string): SignalScore {
  return { value: matches ? 1 : 0, weight: 0, detail: matches ? matchDetail : mismatchDetail };
}

function score(a: Listing, b: Listing): SimilarityResult {
  const prior: SignalScore = { value: PRIOR_LOG_ODDS, weight: 1, detail: `prior λ=${PRIOR_LAMBDA.toString()}` };
  const distance = levelDistance(a.coordinates, b.coordinates);
  const price = levelPrice(a.priceCents, b.priceCents);
  const surface = levelSurface(a.surfaceM2, b.surfaceM2);
  const address = levelAddress(a.address, b.address);
  const rooms = levelRooms(a.rooms, b.rooms);
  const bathrooms = levelBathrooms(a.bathrooms, b.bathrooms);
  const propertyTypeMatch = gate(a.propertyType === b.propertyType, 'mismo tipo de inmueble', 'tipo de inmueble distinto');
  const operationMatch = gate(a.operation === b.operation, 'misma operación', 'operación distinta');

  const signals = { prior, distance, price, surface, address, rooms, bathrooms, propertyTypeMatch, operationMatch };

  // M suma SOLO los campos nombrados explícitamente (nunca propertyTypeMatch
  // ni operationMatch, cuyo `value` es 1/0 de coincidencia, no bits) — la
  // misma exclusión de las claves de veto que hace rule-based/classify.ts
  // en su piso de evidencia, aquí aplicada a la propia suma del posterior.
  const M = prior.value + distance.value + price.value + surface.value + address.value + rooms.value + bathrooms.value;
  const scoreValue = 1 / (1 + Math.pow(2, -M));

  // El veto (propertyTypeMatch/operationMatch, ya calculado arriba) NO
  // recorta M ni el score acumulado — mismo contrato que rule-based
  // (BAND-3): la evidencia se preserva intacta como dato, y es
  // `classifyProbabilistic` quien decide la banda a partir de este score y
  // este mismo desglose (BAND-4: classify nunca recibe los Listing).
  return { score: scoreValue, signals };
}

export const probabilisticDedupStrategy: DedupStrategy = {
  name: STRATEGY_NAME,
  version: STRATEGY_VERSION,
  score,
};

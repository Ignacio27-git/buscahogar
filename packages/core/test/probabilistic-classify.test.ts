import { describe, expect, it } from 'vitest';

import { classifyProbabilistic, FS_BAND_THRESHOLDS } from '../src/strategies/probabilistic/classify.js';
import { probabilisticDedupStrategy } from '../src/strategies/probabilistic/strategy.js';
import type { Coordinates } from '../src/types/coordinates.js';
import { makeListing } from './test-helpers.js';

const MADRID_CENTER: Coordinates = { latitude: 40.4168, longitude: -3.7038 };
// ≈10 m al norte — dentro del nivel "near" de distance (≤20 m).
const NEARBY_10M: Coordinates = { latitude: 40.41689, longitude: -3.7038 };

// Decisión 087 (design.md rev2): a los umbrales por defecto de FS
// (high=0.95, low=0.50), NINGÚN par con como mucho dos campos OPCIONALES
// evaluados a su mejor nivel alcanza `accept` — hacen falta al menos tres
// campos de acuerdo, reflejando MIN_EVALUATED_SIGNALS=3 de rule-based con
// un mecanismo distinto (sin piso de evidencia explícito, la propia
// aritmética de M lo impone).
//
// DESVIACIÓN DOCUMENTADA respecto al cálculo a mano del diseño (D3, no se
// ajustan m/u para cuadrar el test): el diseño ilustra "el mejor caso de dos
// campos" como distance + address ÚNICAMENTE (M=2.807+3.000-3.170=2.637,
// p≈0.862), omitiendo `price`. Pero `priceCents` es OBLIGATORIO en
// `listingSchema` — ningún `Listing` real puede tener el precio ausente, así
// que `price` SIEMPRE se evalúa y SIEMPRE aporta bits a M; ese M=2.637
// concreto es, por tanto, inalcanzable por cualquier par real. Los casos de
// abajo prueban el mismo PRINCIPIO cualitativo (decisión 087: dos campos
// opcionales fuertes, con price en una banda no favorable, no bastan; tres
// campos fuertes, incluyendo price, sí) con valores de M calculados por el
// código real, no con la cifra concreta del diseño. Reportado en el resumen
// de esta tarea, no silenciado.
describe('classifyProbabilistic — decisión 087: dos campos opcionales fuertes no bastan, tres sí (FS_BAND_THRESHOLDS)', () => {
  it('distance + address en su mejor nivel, con price en banda media (ni ausente ni favorable): NO alcanza accept', () => {
    const a = makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      coordinates: NEARBY_10M,
      priceCents: 210_000_00, // ratio = 10 000 00 / 210 000 00 ≈ 4.76% → banda "mid" de price (≤10%, no ≤2%)
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const result = probabilisticDedupStrategy.score(a, b);

    expect(result.signals['surface']?.weight).toBe(0);
    expect(result.signals['rooms']?.weight).toBe(0);
    expect(result.signals['bathrooms']?.weight).toBe(0);
    expect(result.score).toBeLessThan(FS_BAND_THRESHOLDS.high);
    expect(classifyProbabilistic(result)).not.toBe('accept');
  });

  it('distance + price + address, los tres en su mejor nivel: SÍ alcanza accept', () => {
    const a = makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      coordinates: NEARBY_10M,
      priceCents: 201_000_00, // ratio ≈ 0.4975% → banda "near" de price (≤2%)
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const result = probabilisticDedupStrategy.score(a, b);

    expect(result.score).toBeGreaterThanOrEqual(FS_BAND_THRESHOLDS.high);
    expect(classifyProbabilistic(result)).toBe('accept');
  });
});

describe('classifyProbabilistic — el veto fuerza reject, igual que en rule-based (decisión 088, isVetoed compartido)', () => {
  it('propertyType distinto fuerza reject aunque el score sea muy alto', () => {
    const a = makeListing({
      propertyType: 'flat',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      propertyType: 'commercial',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const result = probabilisticDedupStrategy.score(a, b);
    expect(result.score).toBeGreaterThan(FS_BAND_THRESHOLDS.high);
    expect(classifyProbabilistic(result)).toBe('reject');
  });
});

describe('classifyProbabilistic(result, thresholds) — override opcional, mismo contrato que classify() de rule-based', () => {
  it('sin segundo argumento, usa FS_BAND_THRESHOLDS por defecto', () => {
    const a = makeListing({ coordinates: MADRID_CENTER, priceCents: 200_000_00, address: 'Piso en Calle de Sagasta 12, Madrid' });
    const b = makeListing({ coordinates: NEARBY_10M, priceCents: 200_000_00, address: 'Piso en Calle de Sagasta 12, Madrid' });

    const result = probabilisticDedupStrategy.score(a, b);
    expect(classifyProbabilistic(result)).toBe(classifyProbabilistic(result, FS_BAND_THRESHOLDS));
  });
});

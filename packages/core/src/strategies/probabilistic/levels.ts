// Funciones de nivel graduado de la segunda DedupStrategy, Fellegi-Sunter
// (ROADMAP 2.2, decisión 085). Cada una clasifica un par de valores en UNO
// de los niveles m/u de parameters.ts y devuelve sus bits (log2(m/u)) como
// `value` y `weight: 1`. Un campo ausente en cualquiera de los dos lados
// devuelve `absent()` — value 0, weight 0 — que EXCLUYE el campo de M en vez
// de tratarlo como desacuerdo (decisión 086, MAR-exclude): la ausencia deja
// el posterior donde estaba, nunca lo empuja hacia abajo.
import type { Coordinates } from '../../types/coordinates.js';
import type { SignalScore } from '../../types/similarity.js';
import { haversineDistanceMeters } from '../../geo/distance.js';
import { body, isStreetLevel } from '../rule-based/address.js';
import { relativeDifference } from '../rule-based/signals.js';
import {
  ADDRESS_LEVELS,
  BATHROOMS_LEVELS,
  DISTANCE_LEVELS,
  PRICE_LEVELS,
  ROOMS_LEVELS,
  SURFACE_LEVELS,
  type MULevel,
} from './parameters.js';

// Cortes "near" (20 m, 2%) son elecciones a priori nuevas de esta
// estrategia (sin precedente en rule-based). Cortes "mid" (100 m, 10%)
// reutilizan los puntos de decaimiento-a-cero ya medidos en
// rule-based/signals.ts (parameters.ts documenta el porqué completo).
const DISTANCE_NEAR_M = 20;
const DISTANCE_MID_M = 100;
const PRICE_NEAR_RATIO = 0.02;
const PRICE_MID_RATIO = 0.1;
const SURFACE_NEAR_RATIO = 0.02;
const SURFACE_MID_RATIO = 0.1;

function bits(level: MULevel): number {
  return Math.log2(level.m / level.u);
}

function absent(detail: string): SignalScore {
  return { value: 0, weight: 0, detail };
}

export function levelDistance(a: Coordinates | undefined, b: Coordinates | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('coordenadas ausentes en uno de los dos anuncios');
  }

  const meters = haversineDistanceMeters(a, b);
  if (meters <= DISTANCE_NEAR_M) {
    return {
      value: bits(DISTANCE_LEVELS.near),
      weight: 1,
      detail: `distancia ${meters.toFixed(1)} m (≤${DISTANCE_NEAR_M.toString()} m)`,
    };
  }
  if (meters <= DISTANCE_MID_M) {
    return {
      value: bits(DISTANCE_LEVELS.mid),
      weight: 1,
      detail: `distancia ${meters.toFixed(1)} m (≤${DISTANCE_MID_M.toString()} m)`,
    };
  }
  return {
    value: bits(DISTANCE_LEVELS.far),
    weight: 1,
    detail: `distancia ${meters.toFixed(1)} m (>${DISTANCE_MID_M.toString()} m)`,
  };
}

// Precio: SIEMPRE evaluable, igual que en rule-based — `priceCents` es
// obligatorio y positivo en `listingSchema`.
export function levelPrice(priceCentsA: number, priceCentsB: number): SignalScore {
  const ratio = relativeDifference(priceCentsA, priceCentsB);
  if (ratio <= PRICE_NEAR_RATIO) {
    return { value: bits(PRICE_LEVELS.near), weight: 1, detail: `diferencia de precio ${(ratio * 100).toFixed(1)}% (≤2%)` };
  }
  if (ratio <= PRICE_MID_RATIO) {
    return { value: bits(PRICE_LEVELS.mid), weight: 1, detail: `diferencia de precio ${(ratio * 100).toFixed(1)}% (≤10%)` };
  }
  return { value: bits(PRICE_LEVELS.far), weight: 1, detail: `diferencia de precio ${(ratio * 100).toFixed(1)}% (>10%)` };
}

// Superficie ≤0 cuenta como ausente, igual que en rule-based: un valor no
// positivo es un dato inservible, no una evaluación de "sin superficie".
export function levelSurface(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined || a <= 0 || b <= 0) {
    return absent('superficie ausente en uno de los dos anuncios');
  }

  const ratio = relativeDifference(a, b);
  if (ratio <= SURFACE_NEAR_RATIO) {
    return { value: bits(SURFACE_LEVELS.near), weight: 1, detail: `diferencia de superficie ${(ratio * 100).toFixed(1)}% (≤2%)` };
  }
  if (ratio <= SURFACE_MID_RATIO) {
    return { value: bits(SURFACE_LEVELS.mid), weight: 1, detail: `diferencia de superficie ${(ratio * 100).toFixed(1)}% (≤10%)` };
  }
  return { value: bits(SURFACE_LEVELS.far), weight: 1, detail: `diferencia de superficie ${(ratio * 100).toFixed(1)}% (>10%)` };
}

// A diferencia de rule-based (addressExact/addressZone como dos señales
// mutuamente excluyentes), FS trata la dirección como UN único campo de tres
// niveles — reutiliza body()/isStreetLevel() de rule-based/address.ts sin
// duplicar su lógica de normalización.
export function levelAddress(addressA: string | undefined, addressB: string | undefined): SignalScore {
  if (addressA === undefined || addressB === undefined) {
    return absent('dirección ausente en uno de los dos anuncios');
  }

  const bodyA = body(addressA);
  const bodyB = body(addressB);

  if (bodyA !== bodyB) {
    return { value: bits(ADDRESS_LEVELS.different), weight: 1, detail: 'direcciones normalizadas distintas' };
  }
  if (isStreetLevel(addressA)) {
    return {
      value: bits(ADDRESS_LEVELS.streetLevelExact),
      weight: 1,
      detail: 'misma dirección normalizada, con token de nivel de calle',
    };
  }
  return {
    value: bits(ADDRESS_LEVELS.zoneOnly),
    weight: 1,
    detail: 'misma dirección normalizada, sin token de nivel de calle',
  };
}

export function levelRooms(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('número de habitaciones ausente en uno de los dos anuncios');
  }

  const matches = a === b;
  return {
    value: bits(matches ? ROOMS_LEVELS.equal : ROOMS_LEVELS.different),
    weight: 1,
    detail: matches ? 'mismo número de habitaciones' : 'número de habitaciones distinto',
  };
}

export function levelBathrooms(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('número de baños ausente en uno de los dos anuncios');
  }

  const matches = a === b;
  return {
    value: bits(matches ? BATHROOMS_LEVELS.equal : BATHROOMS_LEVELS.different),
    weight: 1,
    detail: matches ? 'mismo número de baños' : 'número de baños distinto',
  };
}

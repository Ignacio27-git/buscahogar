// Funciones de señal individuales de la primera DedupStrategy (RDS-1). Cada
// una decae de forma AFILADA, no suave: el bloqueo de candidatos (ROADMAP
// 1.8) ya garantizó que el par es similar, así que re-codificar esa
// similitud con una decaída amplia no decide nada — lo que separa un
// duplicado real entre portales de un vecino del mismo bloque es la
// EXACTITUD, no la similitud. Precio y superficie llegan a 0 en un 10% de
// diferencia relativa; a esa anchura, un 2% de diferencia puntúa 0.8 y un
// 8% puntúa 0.2 — la separación que necesita la clase de negativos difíciles
// del mismo bloque (ROADMAP 1.9, docs/DECISIONS.md, decisión 006).
import type { Coordinates } from '../../types/coordinates.js';
import type { SignalScore } from '../../types/similarity.js';
import { haversineDistanceMeters } from '../../geo/distance.js';
import { WEIGHTS } from './weights.js';

const DISTANCE_ZERO_M = 100;
const PRICE_ZERO_RATIO = 0.1;
const SURFACE_ZERO_RATIO = 0.1;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function absent(detail: string): SignalScore {
  return { value: 0, weight: 0, detail };
}

// Distancia: decae linealmente hasta 0 a DISTANCE_ZERO_M = 100 m. Ausente si
// falta `coordinates` en cualquiera de los dos lados.
export function scoreDistance(a: Coordinates | undefined, b: Coordinates | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('coordenadas ausentes en uno de los dos anuncios');
  }

  const meters = haversineDistanceMeters(a, b);
  const value = clamp01(1 - meters / DISTANCE_ZERO_M);

  return { value, weight: WEIGHTS.distance, detail: `distancia ${meters.toFixed(1)} m` };
}

// Precio: SIEMPRE evaluable — `priceCents` es obligatorio y positivo en
// `listingSchema` (RDS-1a), así que esta función no admite `undefined`.
export function scorePrice(priceCentsA: number, priceCentsB: number): SignalScore {
  const maxPrice = Math.max(priceCentsA, priceCentsB);
  const ratio = Math.abs(priceCentsA - priceCentsB) / maxPrice;
  const value = clamp01(1 - ratio / PRICE_ZERO_RATIO);

  return { value, weight: WEIGHTS.price, detail: `diferencia de precio ${(ratio * 100).toFixed(1)}%` };
}

// Superficie: mismo decaimiento que precio. Ausente si falta `surfaceM2` en
// cualquiera de los dos lados, o si alguno no es positivo — una superficie
// no positiva es un dato inservible, no una evaluación de "sin superficie".
export function scoreSurface(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined || a <= 0 || b <= 0) {
    return absent('superficie ausente en uno de los dos anuncios');
  }

  const maxSurface = Math.max(a, b);
  const ratio = Math.abs(a - b) / maxSurface;
  const value = clamp01(1 - ratio / SURFACE_ZERO_RATIO);

  return { value, weight: WEIGHTS.surface, detail: `diferencia de superficie ${(ratio * 100).toFixed(1)}%` };
}

// Habitaciones: BINARIO, deliberadamente sin graduar — es el discriminador
// más barato para el mismo bloque (dos pisos del mismo edificio casi nunca
// tienen el mismo número de habitaciones). Graduar una diferencia de una
// habitación a ~0.3 ablandaría precisamente la señal más barata contra el
// peor modo de fallo de decisión 006.
export function scoreRooms(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('número de habitaciones ausente en uno de los dos anuncios');
  }

  const matches = a === b;
  return {
    value: matches ? 1 : 0,
    weight: WEIGHTS.rooms,
    detail: matches ? 'mismo número de habitaciones' : 'número de habitaciones distinto',
  };
}

// Baños: mismo criterio binario que habitaciones.
export function scoreBathrooms(a: number | undefined, b: number | undefined): SignalScore {
  if (a === undefined || b === undefined) {
    return absent('número de baños ausente en uno de los dos anuncios');
  }

  const matches = a === b;
  return {
    value: matches ? 1 : 0,
    weight: WEIGHTS.bathrooms,
    detail: matches ? 'mismo número de baños' : 'número de baños distinto',
  };
}

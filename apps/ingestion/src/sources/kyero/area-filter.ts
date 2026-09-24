// Paso 1.14 — filtro de área/operación/moneda (diseño D8/D9/D10), pura.
// El shell (kyero-source.ts) solo llama a isEligible() por elemento y
// cuenta el motivo de exclusión; ninguna decisión de negocio vive fuera de
// aquí.
import type { AreaQuery, Coordinates } from '@buscahogar/core';

import type { KyeroProperty } from './raw-property.schema.js';

// D10: radio medio de la Tierra en metros (IUGG), distinto a propósito del
// R=6 371 000 m de packages/core/src/geo/distance.ts (deduplicación,
// decisión 050) — ese valor sirve a un umbral de bloqueo de 150-600 m donde
// la divergencia es despreciable; aquí el radio de área lo fija un llamador
// externo y puede ser mucho mayor, así que se usa el valor más preciso.
const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;

  return EARTH_RADIUS_METERS * (2 * Math.asin(Math.sqrt(haversine)));
}

// G2 "nested wins" (diseño D5): <location><latitude/><longitude/></location>
// tiene prioridad sobre latitude/longitude planos en la raíz de <property>.
// Reutilizada por el normalizador (normalizer.ts) para no duplicar esta
// decisión de precedencia en dos sitios.
export function extractCoordinates(raw: KyeroProperty): Coordinates | undefined {
  if (raw.location?.latitude !== undefined && raw.location.longitude !== undefined) {
    return { latitude: raw.location.latitude, longitude: raw.location.longitude };
  }
  if (raw.latitude !== undefined && raw.longitude !== undefined) {
    return { latitude: raw.latitude, longitude: raw.longitude };
  }
  return undefined;
}

// D10: límite inclusivo (`<= radiusMeters`). Sin coordenadas -> false,
// nunca lanza (D8: exclusión conservadora, nunca inventa una posición).
export function isInArea(coordinates: Coordinates | undefined, area: AreaQuery): boolean {
  if (coordinates === undefined) return false;
  return haversineMeters(coordinates, area.center) <= area.radiusMeters;
}

// D9: price_freq ∈ {sale, month} en S1 V3.9; ausente -> sale (confianza
// media, S1); cualquier otro valor -> 'invalid' (nunca lanza, el llamador
// decide excluir).
export function mapOperation(priceFreq: string | undefined): 'sale' | 'rent' | 'invalid' {
  if (priceFreq === undefined || priceFreq === 'sale') return 'sale';
  if (priceFreq === 'month') return 'rent';
  return 'invalid';
}

// D7/D8/D9/D10 combinados (spec "Area, Operation, and Currency
// Eligibility"): moneda EUR/ausente, coordenadas dentro del radio, y
// operación mapeada igual a la del área. Cualquier condición que falle
// excluye — nunca lanza.
export function isEligible(raw: KyeroProperty, area: AreaQuery): boolean {
  if (raw.currency !== undefined && raw.currency !== 'EUR') return false;
  if (!isInArea(extractCoordinates(raw), area)) return false;
  return mapOperation(raw.price_freq) === area.operation;
}

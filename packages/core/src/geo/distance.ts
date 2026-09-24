// Distancia de círculo máximo (Haversine) entre dos Coordinates, pura y sin
// dependencia de PostGIS ni del ORM. Segunda expresión de distancia
// geográfica del monorepo — docs/DECISIONS.md, decisión 050, registra por
// qué existe sin enmendar la decisión 019: esa decisión gobierna el lado
// SQL (packages/db/src/spatial.ts), único punto de distancia contra la base
// de datos; esta vive en packages/core porque ROADMAP 1.9 exige que
// `score(a, b)` derive todo de los dos valores Listing, sin conexión a base
// de datos (Q1 confirmado, obs #144 del ciclo SDD).
//
// Aproxima la Tierra como una esfera de radio R = 6 371 000 m, mientras que
// PostGIS `geography` es geodésico sobre WGS84 (un esferoide). La
// divergencia entre ambas expresiones está acotada en ≲0.5% — a la escala
// del radio de bloqueo (150-600 m) son ≲1.5 m; a la escala de un mismo
// bloque (≈25 m) son ≲0.1 m. La señal `distance` (rule-based/signals.ts)
// decae de forma continua y sin ningún salto cerca de esos radios, así que
// esa magnitud de divergencia no cambia ninguna clasificación (decisión
// 050). Cota derivada, no medida: no hubo base de datos disponible en esta
// fase para un cotejo directo contra el motor real; queda pendiente para
// ROADMAP 1.10.
import type { Coordinates } from '../types/coordinates.js';

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;

  const angularDistance = 2 * Math.asin(Math.sqrt(haversine));

  return EARTH_RADIUS_METERS * angularDistance;
}

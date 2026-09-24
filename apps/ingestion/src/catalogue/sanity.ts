// ROADMAP 1.13 (diseño CR-11, DD-4, DD-5) — puerta de cordura del
// importador, PURA, sin IO. Tres comprobaciones que comparten UN SOLO
// camino de código y un solo resultado (DD-5): caja delimitadora de
// España, consistencia con la provincia declarada, y guarda de
// esparcimiento entre entidades hermanas (solo para tier-2/tier-3 — DD-4).
// Ninguna de las tres lanza: todas devuelven el mismo `SanityResult`, y
// quien llama trata cualquier `passed: false` exactamente igual — la fila
// se importa IGUAL, sin centroide, nunca con un valor sustituto,
// interpolado o adivinado (misma disposición para las tres causas, "un
// branch, no dos").
//
// `provinceBounds` se recibe siempre inyectado, nunca hardcodeado: ninguna
// fuente disponible en este proyecto puede verificar las 52 cajas
// delimitadoras provinciales reales de España sin arriesgarse a fabricar un
// dato geográfico incorrecto (mismo principio que R7). `null` es "el
// operador aún no ha rellenado el límite de esta provincia" — la
// comprobación se OMITE explícitamente, nunca se adivina con un valor por
// defecto silencioso.
import type { Coordinates } from '@buscahogar/core';
import { greatCircleMeters, RADIUS_CEILING_M } from './geo.js';

export interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
}

// España peninsular + Baleares + Canarias + Ceuta/Melilla. El límite
// occidental (-18.5) cubre El Hierro (Canarias); el oriental (4.6) cubre
// las Islas Baleares.
export const SPAIN_BBOX: BoundingBox = { minLat: 27.0, maxLat: 43.9, minLon: -18.5, maxLon: 4.6 };

function withinBbox(coordinates: Coordinates, bbox: BoundingBox): boolean {
  return (
    coordinates.latitude >= bbox.minLat &&
    coordinates.latitude <= bbox.maxLat &&
    coordinates.longitude >= bbox.minLon &&
    coordinates.longitude <= bbox.maxLon
  );
}

export type SanityFailureReason =
  | 'out-of-spain-bbox'
  | 'province-mismatch'
  | 'province-code-mismatch'
  | 'spread-guard';

export interface SanityResult {
  readonly passed: boolean;
  readonly reason: SanityFailureReason | null;
}

export interface SanityCheckInput {
  // DD-4: la guarda de esparcimiento solo se aplica a tier-2/tier-3 — la
  // fila tier-1 es la propia entidad municipal autoritativa, cualquiera que
  // sea el esparcimiento de sus hermanas.
  readonly tier: 'tier-1' | 'tier-2' | 'tier-3';
  readonly centroid: Coordinates;
  readonly siblingCoordinates: readonly Coordinates[];
  readonly provinceBounds: BoundingBox | null;
  // Adaptación al fichero real (continuación 1.13) — comprobación de
  // INTEGRIDAD (comparación de strings, no geográfica), ortogonal a
  // `provinceBounds`: el `COD_PROV` que declara la propia fila del fichero
  // frente al prefijo de 2 dígitos del código de municipio ya derivado
  // (join.ts). `undefined`/`null` en cualquiera de los dos = "no disponible
  // para esta fila" — la comprobación se OMITE explícitamente, nunca se
  // adivina (mismo patrón que `provinceBounds: null`).
  readonly declaredProvinceCode?: string | null;
  readonly expectedProvinceCode?: string | null;
  readonly spainBbox?: BoundingBox;
  readonly spreadCeilingM?: number;
}

export function checkSanity(input: SanityCheckInput): SanityResult {
  const spainBbox = input.spainBbox ?? SPAIN_BBOX;
  if (!withinBbox(input.centroid, spainBbox)) {
    return { passed: false, reason: 'out-of-spain-bbox' };
  }

  if (
    input.declaredProvinceCode != null &&
    input.expectedProvinceCode != null &&
    input.declaredProvinceCode !== input.expectedProvinceCode
  ) {
    return { passed: false, reason: 'province-code-mismatch' };
  }

  if (input.provinceBounds !== null && !withinBbox(input.centroid, input.provinceBounds)) {
    return { passed: false, reason: 'province-mismatch' };
  }

  if (input.tier !== 'tier-1') {
    const ceiling = input.spreadCeilingM ?? RADIUS_CEILING_M;
    const maxSiblingDistance = input.siblingCoordinates.reduce(
      (max, sibling) => Math.max(max, greatCircleMeters(input.centroid, sibling)),
      0
    );
    if (maxSiblingDistance > ceiling) {
      return { passed: false, reason: 'spread-guard' };
    }
  }

  return { passed: true, reason: null };
}

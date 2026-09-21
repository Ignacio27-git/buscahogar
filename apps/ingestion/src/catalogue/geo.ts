// ROADMAP 1.13 (diseño DD-9, Q7) — radio de barrido por municipio, PURO, sin
// IO. El catálogo NGMEP guarda además de cada municipio sus "entidades
// singulares" (núcleos, pedanías...) que comparten su prefijo de 5 dígitos —
// una muestra gratuita, ya en el propio fichero, de dónde vive la población
// real de ese municipio. El radio se deriva de cuánto se esparcen esas
// entidades hermanas respecto al centroide elegido (join.ts, DD-4), acotado
// por dos límites:
// - SUELO: un municipio con una sola entidad (sin hermanas) tendría radio 0
//   sin él — el círculo debe ser real.
// - TECHO: control de CUOTA, no geográfico. Un radio mayor cuesta más
//   páginas por barrido (`maxSearchRequestsPerSweep`); el techo acota la
//   cuota que un solo municipio puede consumir.
import { haversineDistanceMeters } from '@buscahogar/core';
import type { Coordinates } from '@buscahogar/core';

export const RADIUS_FLOOR_M = 2_000;
export const RADIUS_CEILING_M = 15_000;

export function greatCircleMeters(a: Coordinates, b: Coordinates): number {
  return haversineDistanceMeters(a, b);
}

export function deriveSweepRadiusM(centroid: Coordinates, siblingCoordinates: readonly Coordinates[]): number {
  const maxDistance = siblingCoordinates.reduce(
    (max, sibling) => Math.max(max, greatCircleMeters(centroid, sibling)),
    0
  );
  return Math.min(Math.max(maxDistance, RADIUS_FLOOR_M), RADIUS_CEILING_M);
}

// ROADMAP 1.13 (diseño DD-9, Q7) + adaptación al fichero real (continuación
// 1.13) — radio de barrido por municipio, PURO, sin IO. El diseño original
// derivaba el radio de cuánto se esparcían las "entidades singulares"
// hermanas de ENTIDADES.csv respecto al centroide — una muestra INDIRECTA.
// `MUNICIPIOS.csv` trae algo mejor: `SUPERFICIE` (hectáreas), la superficie
// oficial publicada del propio municipio. El radio es ahora el del círculo
// cuya área coincide con esa superficie real: `sqrt(superficie_m2 / π)` —
// derivado del dato, no estimado —, acotado por los mismos dos límites:
// - SUELO: un municipio sin dato de superficie utilizable tendría radio 0
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

export function deriveSweepRadiusM(superficieHectares: number): number {
  // Sin dato de superficie utilizable (0, negativo, NaN): no hay círculo
  // real que derivar — el SUELO es el valor seguro, nunca 0 (mismo
  // razonamiento que "sin hermanas" en el diseño original).
  if (!Number.isFinite(superficieHectares) || superficieHectares <= 0) {
    return RADIUS_FLOOR_M;
  }
  const areaM2 = superficieHectares * 10_000;
  const radius = Math.round(Math.sqrt(areaM2 / Math.PI));
  return Math.min(Math.max(radius, RADIUS_FLOOR_M), RADIUS_CEILING_M);
}

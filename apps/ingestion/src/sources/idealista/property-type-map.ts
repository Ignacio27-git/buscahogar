// Paso 1.6 — mapa fuente→dominio de propertyType (diseño D9). Verificado
// contra ambas fixtures: flat/penthouse/duplex en homes, premise en
// premises. `chalet`→house (research C4) y cualquier otro valor→other no
// tienen evidencia de fixture — offices/garages/bedrooms nunca se han
// sondeado — pero el mapa debe existir por adelantado y degradar sin
// lanzar nunca (R2), porque un propertyType sin clasificar sigue siendo un
// anuncio real y vendible.
import type { PropertyType } from '@buscahogar/core';

const PROPERTY_TYPE_MAP: Readonly<Record<string, PropertyType>> = {
  flat: 'flat',
  penthouse: 'penthouse',
  duplex: 'duplex',
  premise: 'commercial',
  chalet: 'house',
};

export interface PropertyTypeMapping {
  readonly recognised: boolean;
  readonly value: PropertyType;
}

export function mapPropertyType(rawValue: string): PropertyType {
  return PROPERTY_TYPE_MAP[rawValue] ?? 'other';
}

// Pura y sin I/O a propósito: el normalizador debe seguir siendo silencioso
// (D9), así que el reporte de "reconocido/no reconocido" vive en una función
// hermana, no dentro de `normalize`. El shell del adaptador (1.6/1.7) es
// quien decide si registrar el resultado vía SweepLogger.
export function describeMapping(rawValue: string): PropertyTypeMapping {
  const mapped = PROPERTY_TYPE_MAP[rawValue];
  return mapped === undefined ? { recognised: false, value: 'other' } : { recognised: true, value: mapped };
}

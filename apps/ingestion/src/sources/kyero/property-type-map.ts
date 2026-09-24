// Paso 1.14 — mapa fuente->dominio de type (diseño, tabla "Type map").
// Kyero no publica un vocabulario cerrado para <type> (texto libre del PMS
// del agente, research R2, mismo problema que Idealista propertyType) —
// `other` es la válvula de seguridad, igual que
// apps/ingestion/src/sources/idealista/property-type-map.ts. Claves en
// minúscula y recortadas: mapPropertyType normaliza la entrada antes de
// consultar la tabla.
import type { PropertyType } from '@buscahogar/core';

const PROPERTY_TYPE_MAP: Readonly<Record<string, PropertyType>> = {
  apartment: 'flat',
  flat: 'flat',
  penthouse: 'penthouse',
  duplex: 'duplex',
  studio: 'studio',
  villa: 'house',
  house: 'house',
  townhouse: 'house',
  'town house': 'house',
  'detached house': 'house',
  'semi-detached house': 'house',
  bungalow: 'house',
  'country house': 'house',
  finca: 'house',
  cortijo: 'house',
  chalet: 'house',
  land: 'land',
  plot: 'land',
  commercial: 'commercial',
  shop: 'commercial',
  premises: 'commercial',
  business: 'commercial',
  garage: 'garage',
  parking: 'garage',
  storage: 'storage_room',
  building: 'building',
};

function normaliseKey(rawValue: string): string {
  return rawValue.trim().toLowerCase();
}

export interface PropertyTypeMapping {
  readonly recognised: boolean;
  readonly value: PropertyType;
}

export function mapPropertyType(rawValue: string): PropertyType {
  return PROPERTY_TYPE_MAP[normaliseKey(rawValue)] ?? 'other';
}

// Pura y sin I/O, mismo patrón que describeMapping de Idealista: el shell
// del adaptador decide si registrar un tipo no reconocido en diagnostics().
export function describeMapping(rawValue: string): PropertyTypeMapping {
  const mapped = PROPERTY_TYPE_MAP[normaliseKey(rawValue)];
  return mapped === undefined ? { recognised: false, value: 'other' } : { recognised: true, value: mapped };
}

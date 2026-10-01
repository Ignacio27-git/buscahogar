// ROADMAP 3.1 (decisión 123) — rótulos en español de los criterios de
// búsqueda, compartidos por el formulario de criterios. Los valores son los
// del esquema (`OPERATION_TYPES`, `PROPERTY_TYPES`, ...); solo el texto es de
// presentación. Tipados con `Record` sobre las uniones del núcleo, de modo que
// un valor nuevo sin rótulo no compila.
import type { NlParamKey, OperationType, PropertyType } from '@buscahogar/core';

export const OPERATION_LABELS: Readonly<Record<OperationType, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
};

export const PROPERTY_TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  flat: 'Piso',
  house: 'Casa',
  penthouse: 'Ático',
  duplex: 'Dúplex',
  studio: 'Estudio',
  land: 'Terreno',
  commercial: 'Local comercial',
  garage: 'Garaje',
  storage_room: 'Trastero',
  building: 'Edificio',
  other: 'Otro',
};

export const SORT_LABELS: Readonly<Record<'price' | 'surface' | 'updated', string>> = {
  price: 'Precio',
  surface: 'Superficie',
  updated: 'Última actualización',
};

export const DIR_LABELS: Readonly<Record<'asc' | 'desc', string>> = {
  asc: 'Ascendente',
  desc: 'Descendente',
};

// Rótulo de cada campo, para las etiquetas y para citar un campo en conflicto.
export const FIELD_LABELS: Readonly<Record<NlParamKey | 'place', string>> = {
  operation: 'Operación',
  propertyType: 'Tipo de vivienda',
  minPrice: 'Precio mínimo (€)',
  maxPrice: 'Precio máximo (€)',
  minSurface: 'Superficie mínima (m²)',
  maxSurface: 'Superficie máxima (m²)',
  minRooms: 'Habitaciones (mínimo)',
  minBathrooms: 'Baños (mínimo)',
  sort: 'Ordenar por',
  dir: 'Sentido',
  place: 'Lugar',
};

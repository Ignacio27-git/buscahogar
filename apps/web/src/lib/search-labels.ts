// ROADMAP 3.1 (decisión 123) — rótulos en español de los criterios de
// búsqueda, compartidos por el formulario de criterios. Los valores son los
// del esquema (`OPERATION_TYPES`, `PROPERTY_TYPES`, ...); solo el texto es de
// presentación. Tipados con `Record` sobre las uniones del núcleo, de modo que
// un valor nuevo sin rótulo no compila.
import type { NlParamKey, OperationType, PropertySearchCriteria, PropertyType } from '@buscahogar/core';

import { formatPriceCents } from '@/lib/format-price';
import type { AppliedFilterKey } from '@/lib/search-href';

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

// D.6b (decisión 134) — rótulo de un valor que llega como `string | null` (la
// fila de resultado lo recibe así de la base). `null` si falta o no es un valor
// conocido: nunca se muestra el valor crudo ni se inventa un texto de reserva,
// que es decisión del componente. `Object.hasOwn` evita claves del prototipo.
function labelOrNull(labels: Readonly<Record<string, string>>, value: string | null): string | null {
  return value !== null && Object.hasOwn(labels, value) ? (labels[value] ?? null) : null;
}

export function propertyTypeLabel(value: string | null): string | null {
  return labelOrNull(PROPERTY_TYPE_LABELS, value);
}

export function operationLabel(value: string | null): string | null {
  return labelOrNull(OPERATION_LABELS, value);
}

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

// D.6a — un filtro aplicado: la clave identifica qué quita su enlace
// (`buildRemoveFilterHref`) y el rótulo es el nombre más el valor real.
export interface AppliedFilter {
  readonly key: AppliedFilterKey;
  readonly label: string;
}

const METERS_PER_KM = 1000;

function formatNumber(value: number, maximumFractionDigits = 20): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits });
}

function formatRadius(radiusMeters: number): string {
  return radiusMeters >= METERS_PER_KM
    ? `A ${formatNumber(radiusMeters / METERS_PER_KM, 1)} km de un punto`
    : `A ${formatNumber(radiusMeters)} m de un punto`;
}

// Describe `criteria` (lo que pidió el usuario), NUNCA `effectiveCriteria`: esa
// añade `geo` derivado de una zona cubierta y produciría un chip de radio que
// el usuario no escribió. Orden = orden de la barra, y la zona geográfica al final.
export function describeAppliedFilters(
  criteria: PropertySearchCriteria,
  zoneName: string | null
): readonly AppliedFilter[] {
  const filters: AppliedFilter[] = [];
  const add = (key: AppliedFilterKey, label: string): void => {
    filters.push({ key, label });
  };

  if (criteria.operation !== undefined) add('operation', `Operación: ${OPERATION_LABELS[criteria.operation]}`);
  if (criteria.propertyType !== undefined) add('propertyType', `Tipo: ${PROPERTY_TYPE_LABELS[criteria.propertyType]}`);
  if (criteria.minPriceCents !== undefined) add('minPrice', `Precio desde ${formatPriceCents(criteria.minPriceCents)}`);
  if (criteria.maxPriceCents !== undefined) add('maxPrice', `Precio hasta ${formatPriceCents(criteria.maxPriceCents)}`);
  if (criteria.minSurfaceM2 !== undefined) add('minSurface', `Superficie desde ${formatNumber(criteria.minSurfaceM2)} m²`);
  if (criteria.maxSurfaceM2 !== undefined) add('maxSurface', `Superficie hasta ${formatNumber(criteria.maxSurfaceM2)} m²`);
  if (criteria.minRooms !== undefined) add('minRooms', `Habitaciones: ${String(criteria.minRooms)} o más`);
  if (criteria.minBathrooms !== undefined) add('minBathrooms', `Baños: ${String(criteria.minBathrooms)} o más`);
  if (criteria.zone !== undefined) add('zone', zoneName !== null ? `Zona: ${zoneName}` : `Zona INE ${criteria.zone}`);
  if (criteria.polygon !== undefined) add('polygon', 'Zona dibujada');
  if (criteria.geo !== undefined) add('geo', formatRadius(criteria.geo.radiusMeters));
  return filters;
}

// D.6b (decisión 154) — filtros que viven dentro de la bandeja. Ni el orden
// (`sort`/`dir`) ni la zona, el polígono o el punto con radio son campos de la
// bandeja: la zona y el radio se ven en sus chips y el orden no es un filtro.
export const TRAY_FILTER_KEYS: readonly AppliedFilterKey[] = [
  'operation',
  'propertyType',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'minBathrooms',
];

// Se deriva de `describeAppliedFilters`, la misma fuente que los chips, así que
// el número de la bandeja coincide por construcción con los chips de criterio.
export function countTrayFilters(criteria: PropertySearchCriteria): number {
  return describeAppliedFilters(criteria, null).filter((filter) => TRAY_FILTER_KEYS.includes(filter.key)).length;
}

// Recuento de la lista: completo solo en la página 1 sin página siguiente; en
// cualquier otro caso `shown` es solo lo de esta página y el texto lo dice. El
// número de página lo da el paginador (D.6b), no este texto.
export function formatListCount(shown: number, page: number, hasNextPage: boolean): string {
  const noun = shown === 1 ? 'resultado' : 'resultados';
  return page === 1 && !hasNextPage ? `${String(shown)} ${noun}` : `${String(shown)} ${noun} en esta página`;
}

export function formatMapCount(total: number): string {
  return `${String(total)} ${total === 1 ? 'vivienda con ubicación coincide' : 'viviendas con ubicación coinciden'}`;
}

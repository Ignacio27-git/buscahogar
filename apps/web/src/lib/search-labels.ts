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

// D.9 (decisión 174) — nombre de la fuente de un anuncio. Tipado con `Record`
// (134); una clave sin rótulo da «Otra fuente», nunca la clave cruda.
export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  idealista: 'Idealista',
  kyero: 'Kyero',
};

export function sourceLabel(key: string): string {
  return labelOrNull(SOURCE_LABELS, key) ?? 'Otra fuente';
}

// D.9 (decisión 174) — planta en español natural a partir de los códigos reales
// de Idealista (`raw-element.schema.ts`): un dígito n > 0 es «n.ª», 0 y `bj`
// «Bajo», `en` «Entresuelo», `ss` «Semisótano», `st` «Sótano». Un código
// desconocido devuelve `null`: cuenta como dato que falta.
const FLOOR_CODE_LABELS: Readonly<Record<string, string>> = {
  bj: 'Bajo',
  en: 'Entresuelo',
  ss: 'Semisótano',
  st: 'Sótano',
};

export function floorLabel(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d+$/.test(value)) {
    const level = Number(value);
    return level === 0 ? 'Bajo' : `${String(level)}.ª`;
  }
  return labelOrNull(FLOOR_CODE_LABELS, value);
}

// D.18 (decisión 227): los desplegables de orden y sentido desaparecen; los rótulos de la ordenación
// viven en `lib/sort-presets.ts`. `FIELD_LABELS.sort/dir` se conservan para los rechazos con nombre.

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

// D.14 (decisión 192) — rótulo de cada clave de la URL que el esquema de búsqueda puede rechazar.
// Tipado con `Record` sobre la unión de claves, así que una clave nueva sin rótulo no compila.
// Reutiliza los de `FIELD_LABELS` (sin `place`, que no es un parámetro de la URL).
type SearchParamKey = Exclude<keyof typeof FIELD_LABELS, 'place'> | 'lat' | 'lng' | 'radius' | 'zone' | 'polygon' | 'page' | 'view';

export const SEARCH_PARAM_LABELS: Readonly<Record<SearchParamKey, string>> = {
  operation: FIELD_LABELS.operation,
  propertyType: FIELD_LABELS.propertyType,
  minPrice: FIELD_LABELS.minPrice,
  maxPrice: FIELD_LABELS.maxPrice,
  minSurface: FIELD_LABELS.minSurface,
  maxSurface: FIELD_LABELS.maxSurface,
  minRooms: FIELD_LABELS.minRooms,
  minBathrooms: FIELD_LABELS.minBathrooms,
  sort: FIELD_LABELS.sort,
  dir: FIELD_LABELS.dir,
  lat: 'Latitud',
  lng: 'Longitud',
  radius: 'Radio',
  zone: 'Zona',
  polygon: 'Zona dibujada',
  page: 'Página',
  view: 'Vista',
};

// «Rótulo: mensaje». Los mensajes del núcleo son fragmentos sin la clave, pensados para leerse
// detrás de la etiqueta. Un problema sin clave con rótulo (camino vacío, clave desconocida o
// segmento numérico) devuelve el mensaje con la inicial en mayúscula: nunca la clave cruda.
export function formatSearchIssue(issue: { readonly path: readonly PropertyKey[]; readonly message: string }): string {
  const key = issue.path[0];
  if (typeof key === 'string' && Object.hasOwn(SEARCH_PARAM_LABELS, key)) {
    return `${SEARCH_PARAM_LABELS[key as SearchParamKey]}: ${issue.message}`;
  }
  return issue.message.charAt(0).toLocaleUpperCase('es-ES') + issue.message.slice(1);
}

// D.15 (F4, decisión 196) — claves de los parámetros que el esquema rechazó, para marcar sus campos
// con `aria-invalid`. Cuenta el primer segmento textual del camino; un problema sin camino no
// señala ningún campo. Compartido por la rama de parámetros inválidos y por el panel de `?q=`.
export function rejectedParamKeys(issues: readonly { readonly path: readonly PropertyKey[] }[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string') keys.add(key);
  }
  return keys;
}

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
  // D.18 (decisión 224): la zona con centroide y radio siempre se aplica; el chip no lleva sufijo.
  if (criteria.zone !== undefined) add('zone', zoneName !== null ? `Zona: ${zoneName}` : `Zona INE ${criteria.zone}`);
  if (criteria.polygon !== undefined) add('polygon', 'Zona dibujada');
  if (criteria.geo !== undefined) add('geo', formatRadius(criteria.geo.radiusMeters));
  return filters;
}

// D.18 (decisión 226, reemplaza la 154) — el número de «Filtros N» es el de los chips: sale de
// `describeAppliedFilters`, la misma fuente, así que coincide por construcción. Cuenta también la
// zona, el polígono y el punto con radio (antes quedaban fuera por no ser campos de la bandeja).
export function countAppliedFilters(criteria: PropertySearchCriteria): number {
  return describeAppliedFilters(criteria, null).length;
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

// D.8a (SMV-20, decisión 166) — nombre accesible de un marcador: «Vivienda, 250.000 €.
// Ver detalle». El marcador es un `divIcon` (Leaflet solo aplica `alt` a iconos de
// imagen), así que el nombre sale del texto visible más este `title`. La etiqueta sin
// precio («Precio no disponible») se baja a minúscula para que la frase siga fluida.
export function formatMarkerTitle(priceLabel: string): string {
  const label = priceLabel.charAt(0).toLowerCase() + priceLabel.slice(1);
  return `Vivienda, ${label}. Ver detalle`;
}

// Unidad que el clúster anuncia a un lector de pantalla junto al número.
export function formatClusterUnit(count: number): string {
  return count === 1 ? 'vivienda' : 'viviendas';
}

// D.7 (decisión 160) — la única línea de estado de la interpretación de `?q=`.
// Recibe solo recuentos y banderas: el texto es de presentación y vive aquí para
// poder probarlo sin renderizar. Orden de las partes: sin reconocer, contradictorias
// y, al final, la zona pendiente de elegir.
export interface InterpretationStatusInput {
  // Algún criterio o una zona exacta se ha reconocido.
  readonly hasRecognised: boolean;
  readonly unrecognised: number;
  readonly conflicts: number;
  // Hay un lugar ambiguo cuya zona tiene que elegir la persona.
  readonly zonePending: boolean;
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

export function describeInterpretationStatus(input: InterpretationStatusInput): string {
  const { hasRecognised, unrecognised, conflicts, zonePending } = input;
  const issues: string[] = [];
  if (unrecognised > 0) issues.push(countPhrase(unrecognised, 'parte sin reconocer', 'partes sin reconocer'));
  if (conflicts > 0) issues.push(countPhrase(conflicts, 'indicación contradictoria', 'indicaciones contradictorias'));

  if (hasRecognised) {
    const parts = zonePending ? [...issues, 'la zona, que tienes que elegir'] : issues;
    return parts.length === 0
      ? 'Todo tu texto se ha convertido en filtros.'
      : `Tu texto se ha convertido en filtros, salvo ${parts.join(' y ')}.`;
  }
  if (zonePending) {
    const base = 'Todavía no hay ningún filtro: elige la zona abajo.';
    return issues.length === 0 ? base : `${base} Además, hay ${issues.join(' y ')}.`;
  }
  return 'Ninguna parte de tu texto se ha convertido en filtros.';
}

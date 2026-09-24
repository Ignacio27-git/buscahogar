// Sonda de la API de Idealista (paso 1.5) — análisis offline (D8).
//
// Pura y reutilizable en modo `--analyse` sobre fixtures ya commiteadas, sin
// red ni credenciales. Calcula el material en bruto que el paso 1.4
// necesitaba para cerrar `Listing` (obs #67): inventario de campos,
// optionalidad cruzada entre perfiles, censo de coordenadas y lectura de
// paginación. Ver el diseño para los límites honestos de lo que estos datos
// pueden y no pueden demostrar (tamaño de página vs. máximo real, exactitud
// de coordenadas como señal de cota inferior, generalización de una única
// muestra).
import { isJsonObject, type Json } from './anonymise.js';

export interface FieldObservation {
  readonly path: string;
  readonly types: readonly string[];
  readonly present: number;
  readonly nulls: number;
}

export interface CoordinateSample {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PaginationReadout {
  readonly total: number | null;
  readonly totalPages: number | null;
  readonly actualPage: number | null;
  readonly itemsPerPage: number | null;
  readonly paginable: boolean | null;
  readonly hiddenResults: boolean | null;
  readonly observedItemCount: number;
}

export interface DocumentSummary {
  readonly itemCount: number;
  readonly fields: readonly FieldObservation[];
  readonly decimalPrecisionHistogram: Readonly<Record<number, number>>;
  readonly distinctCoordinateCount: number;
  readonly maxDistanceFromCenterMeters: number | null;
  readonly pagination: PaginationReadout;
}

export interface CrossTabEntry {
  readonly field: string;
  readonly presentIn: readonly string[];
}

// Centro de referencia de la petición de búsqueda (mismo punto que
// `scripts/probe-idealista.ts`). Se repite aquí, en lugar de importarlo,
// para no crear un ciclo entre el entrypoint y este módulo puro.
const DEFAULT_CENTER: CoordinateSample = { latitude: 40.43, longitude: -3.702 };

function jsType(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// Agrega, para una lista plana de "elementos" (la raíz envuelta en un array
// de un elemento, o `elementList` completo), el tipo observado y los
// conteos de presencia/nulos de cada clave propia. No desciende más allá de
// un nivel: el diseño pide el inventario de raíz y de `elementList[i]`, no
// una recursión arbitraria.
function collectFieldObservations(items: readonly Json[], pathPrefix: string): FieldObservation[] {
  const byPath = new Map<string, { readonly types: Set<string>; present: number; nulls: number }>();

  items.forEach((item) => {
    if (!isJsonObject(item)) return;
    Object.entries(item).forEach(([key, value]) => {
      const path = `${pathPrefix}${key}`;
      const entry = byPath.get(path) ?? { types: new Set<string>(), present: 0, nulls: 0 };
      entry.present += 1;
      entry.types.add(jsType(value));
      if (value === null) entry.nulls += 1;
      byPath.set(path, entry);
    });
  });

  return [...byPath.entries()]
    .map(([path, entry]) => ({
      path,
      types: [...entry.types].sort(),
      present: entry.present,
      nulls: entry.nulls,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function extractCoordinates(items: readonly Json[]): readonly CoordinateSample[] {
  const coordinates: CoordinateSample[] = [];
  items.forEach((item) => {
    if (!isJsonObject(item)) return;
    const latitude = item.latitude;
    const longitude = item.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      coordinates.push({ latitude, longitude });
    }
  });
  return coordinates;
}

function decimalPlaces(value: number): number {
  const text = value.toString();
  const dotIndex = text.indexOf('.');
  return dotIndex === -1 ? 0 : text.length - dotIndex - 1;
}

function buildDecimalHistogram(coordinates: readonly CoordinateSample[]): Record<number, number> {
  const histogram: Record<number, number> = {};
  coordinates.forEach((coordinate) => {
    [coordinate.latitude, coordinate.longitude].forEach((value) => {
      const places = decimalPlaces(value);
      histogram[places] = (histogram[places] ?? 0) + 1;
    });
  });
  return histogram;
}

function countDistinctCoordinates(coordinates: readonly CoordinateSample[]): number {
  const seen = new Set(coordinates.map((coordinate) => `${String(coordinate.latitude)},${String(coordinate.longitude)}`));
  return seen.size;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Haversine local: packages/core está pausado (ROADMAP 1.4) y
// packages/db/src/spatial.ts es un helper del lado SQL, no invocable aquí.
function haversineDistanceMeters(a: CoordinateSample, b: CoordinateSample): number {
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function maxDistanceFromCenter(coordinates: readonly CoordinateSample[], center: CoordinateSample): number | null {
  if (coordinates.length === 0) return null;
  return Math.max(...coordinates.map((coordinate) => haversineDistanceMeters(center, coordinate)));
}

function readNumber(value: Json | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function readBoolean(value: Json | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function buildPaginationReadout(
  root: { readonly [key: string]: Json },
  observedItemCount: number
): PaginationReadout {
  return {
    total: readNumber(root.total),
    totalPages: readNumber(root.totalPages),
    actualPage: readNumber(root.actualPage),
    itemsPerPage: readNumber(root.itemsPerPage),
    paginable: readBoolean(root.paginable),
    hiddenResults: readBoolean(root.hiddenResults),
    observedItemCount,
  };
}

export function summarise(document: Json, center: CoordinateSample = DEFAULT_CENTER): DocumentSummary {
  const root = isJsonObject(document) ? document : {};
  const elementListValue = root.elementList;
  const items: readonly Json[] = Array.isArray(elementListValue) ? elementListValue : [];

  const rootFields = collectFieldObservations([document], '');
  const itemFields = collectFieldObservations(items, 'elementList[].');
  const coordinates = extractCoordinates(items);

  return {
    itemCount: items.length,
    fields: [...rootFields, ...itemFields],
    decimalPrecisionHistogram: buildDecimalHistogram(coordinates),
    distinctCoordinateCount: countDistinctCoordinates(coordinates),
    maxDistanceFromCenterMeters: maxDistanceFromCenter(coordinates, center),
    pagination: buildPaginationReadout(root, items.length),
  };
}

// Compara dos resúmenes (típicamente "homes" vs "premises") y devuelve, para
// cada campo observado en cualquiera de los dos, en cuál de las dos
// etiquetas apareció. Un campo con una sola etiqueta es "observado como
// opcional": ausente en el otro perfil de esta muestra, no necesariamente en
// general (el diseño insiste en leerlo como evidencia, no como prueba).
export function crossTabulate(
  a: DocumentSummary,
  b: DocumentSummary,
  labels: readonly [string, string] = ['a', 'b']
): readonly CrossTabEntry[] {
  const [labelA, labelB] = labels;
  const fieldsA = new Set(a.fields.map((field) => field.path));
  const fieldsB = new Set(b.fields.map((field) => field.path));
  const allFields = new Set([...fieldsA, ...fieldsB]);

  return [...allFields]
    .map((field) => {
      const presentIn: string[] = [];
      if (fieldsA.has(field)) presentIn.push(labelA);
      if (fieldsB.has(field)) presentIn.push(labelB);
      return { field, presentIn };
    })
    .sort((x, y) => x.field.localeCompare(y.field));
}

export function renderAnalysisReport(summary: DocumentSummary): string {
  const lines: string[] = [`Elementos observados: ${String(summary.itemCount)}`, 'Inventario de campos:'];

  summary.fields.forEach((field) => {
    lines.push(
      `  ${field.path}: ${field.types.join('|')} (presentes: ${String(field.present)}, nulos: ${String(field.nulls)})`
    );
  });

  const histogramText = Object.entries(summary.decimalPrecisionHistogram)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([decimals, count]) => `${decimals} decimales × ${String(count)}`)
    .join(', ');

  lines.push(`Coordenadas distintas: ${String(summary.distinctCoordinateCount)}`);
  lines.push(`Histograma de precisión decimal: ${histogramText || '(sin coordenadas numéricas observadas)'}`);
  lines.push(
    summary.maxDistanceFromCenterMeters === null
      ? 'Distancia máxima al centro solicitado: (sin coordenadas numéricas observadas)'
      : `Distancia máxima al centro solicitado: ${summary.maxDistanceFromCenterMeters.toFixed(1)} m`
  );

  const pagination = summary.pagination;
  lines.push(
    `Paginación: total=${String(pagination.total)}, totalPages=${String(pagination.totalPages)}, ` +
      `actualPage=${String(pagination.actualPage)}, itemsPerPage=${String(pagination.itemsPerPage)}, ` +
      `paginable=${String(pagination.paginable)}, hiddenResults=${String(pagination.hiddenResults)}, ` +
      `elementos observados=${String(pagination.observedItemCount)}`
  );

  return lines.join('\n');
}

// ROADMAP 2.4 (search-indexing-performance) — query-matrix.ts (diseño,
// sección "Query Matrix"; fase 2, tarea 2.2). Enumera, como literales
// `PropertySearchCriteria`, las combinaciones que `scripts/bench-search.ts`
// mide contra la consulta de producción de su `kind` (`buildPropertySearchQuery`,
// `buildMapPointsQuery` o `buildMapCountQuery` de `@buscahogar/db`; ver
// `query-dispatch.ts`). Módulo PURO:
// ninguna función de este fichero abre conexión ni lee `process.env`.
//
// Reutiliza `BENCH_COMBINATION_IDS` de `bench-options.ts` (fase 1, tarea
// 1.4) en vez de declarar su propia lista de ids — ese fichero ya la
// necesitaba para validar `--only` antes de que este módulo existiera
// (diseño, tabla de ficheros: "query-matrix.ts importará esta misma
// constante en vez de duplicar la lista"). `CRITERIA`/`DESCRIPTIONS` están
// (y `KINDS`) están tipados como `Record<BenchCombinationId, …>`: al
// TypeScript exigir las 19 claves exactas, olvidar una combinación o escribir un id inexistente es
// un error de compilación, no un hueco silencioso en la matriz.
import type { PolygonRing, PropertySearchCriteria } from '@buscahogar/core';

import { BENCH_COMBINATION_IDS } from './bench-options.js';
import type { BenchCombinationId, BenchKind } from './bench-options.js';

export interface BenchCombination {
  readonly id: BenchCombinationId;
  readonly description: string;
  // Consulta de producción que se mide (lista, puntos del mapa o recuento).
  readonly kind: BenchKind;
  readonly criteria: PropertySearchCriteria;
}

// Centro de Madrid (diseño, "Corpus Shape": "60% Madrid (-3.7038, 40.4168)")
// — mismas coordenadas que `corpus-sql.ts`, para que los filtros geográficos
// de esta matriz sí encuentren filas del corpus sintético cerca del centro.
const MADRID_LON = -3.7038;
const MADRID_LAT = 40.4168;

// ROADMAP 2.6 — polígonos del banco. Rectángulos de anillo abierto (lat, lon),
// a 5 decimales, válidos según core. El corpus reparte ~60% de las filas
// alrededor de Madrid y el resto de forma uniforme en la península, así que un
// polígono lejos de Madrid es la zona "dispersa" que sondea la trampa del
// LIMIT: pocos candidatos por índice de orden, muchos descartes por el filtro.
function rectangle(centerLat: number, centerLon: number, halfLat: number, halfLon: number): PolygonRing {
  const round = (value: number): number => Math.round(value * 1e5) / 1e5;
  return [
    { lat: round(centerLat - halfLat), lon: round(centerLon - halfLon) },
    { lat: round(centerLat - halfLat), lon: round(centerLon + halfLon) },
    { lat: round(centerLat + halfLat), lon: round(centerLon + halfLon) },
    { lat: round(centerLat + halfLat), lon: round(centerLon - halfLon) },
  ];
}

// ≈1 km² en el centro de Madrid.
const POLYGON_SMALL = rectangle(MADRID_LAT, MADRID_LON, 0.0045, 0.0059);
// ≈2.394 km² sobre Madrid (tope legal: 2.500 km²).
const POLYGON_LARGE_MADRID = rectangle(MADRID_LAT, MADRID_LON, 0.215, 0.295);
// ≈2.435 km² sobre Extremadura, zona poco densa del corpus.
const POLYGON_LARGE_SPARSE = rectangle(38.0, -6.0, 0.215, 0.29);

const CRITERIA: Record<BenchCombinationId, PropertySearchCriteria> = {
  default: { sort: 'updated', dir: 'desc', page: 1 },
  'op-type': { operation: 'sale', propertyType: 'flat', sort: 'updated', dir: 'desc', page: 1 },
  'price-range-rent': {
    operation: 'rent',
    minPriceCents: 60_000,
    maxPriceCents: 150_000,
    sort: 'price',
    dir: 'asc',
    page: 1,
  },
  'price-desc': { sort: 'price', dir: 'desc', page: 1 },
  'surface-selective': { minSurfaceM2: 300, sort: 'updated', dir: 'desc', page: 1 },
  'surface-sort': { minSurfaceM2: 80, maxSurfaceM2: 120, sort: 'surface', dir: 'asc', page: 1 },
  'rooms-baths': { minRooms: 4, minBathrooms: 3, sort: 'updated', dir: 'desc', page: 1 },
  'geo-1km': { geo: { lon: MADRID_LON, lat: MADRID_LAT, radiusMeters: 1000 }, sort: 'updated', dir: 'desc', page: 1 },
  'geo-25km-price': {
    geo: { lon: MADRID_LON, lat: MADRID_LAT, radiusMeters: 25_000 },
    sort: 'price',
    dir: 'asc',
    page: 1,
  },
  'all-filters': {
    operation: 'sale',
    propertyType: 'flat',
    minPriceCents: 6_000_000,
    maxPriceCents: 150_000_000,
    minSurfaceM2: 60,
    maxSurfaceM2: 200,
    minRooms: 2,
    minBathrooms: 1,
    geo: { lon: MADRID_LON, lat: MADRID_LAT, radiusMeters: 5000 },
    sort: 'updated',
    dir: 'desc',
    page: 1,
  },
  'deep-default': { sort: 'updated', dir: 'desc', page: 100 },
  'deep-filtered': { operation: 'sale', propertyType: 'flat', sort: 'price', dir: 'asc', page: 100 },
  'polygon-small': { polygon: POLYGON_SMALL, sort: 'updated', dir: 'desc', page: 1 },
  'polygon-large-price': { polygon: POLYGON_LARGE_MADRID, sort: 'price', dir: 'asc', page: 1 },
  'polygon-sparse': { polygon: POLYGON_LARGE_SPARSE, sort: 'updated', dir: 'desc', page: 1 },
  'map-points-default': { sort: 'updated', dir: 'desc', page: 1 },
  'map-count-default': { sort: 'updated', dir: 'desc', page: 1 },
  'map-points-polygon-large': { polygon: POLYGON_LARGE_MADRID, sort: 'updated', dir: 'desc', page: 1 },
  'map-count-polygon-large': { polygon: POLYGON_LARGE_MADRID, sort: 'updated', dir: 'desc', page: 1 },
};

// Exhaustivo en compilación: un id nuevo sin `kind` es un error de tipos.
const KINDS: Record<BenchCombinationId, BenchKind> = {
  default: 'list',
  'op-type': 'list',
  'price-range-rent': 'list',
  'price-desc': 'list',
  'surface-selective': 'list',
  'surface-sort': 'list',
  'rooms-baths': 'list',
  'geo-1km': 'list',
  'geo-25km-price': 'list',
  'all-filters': 'list',
  'deep-default': 'list',
  'deep-filtered': 'list',
  'polygon-small': 'list',
  'polygon-large-price': 'list',
  'polygon-sparse': 'list',
  'map-points-default': 'map-points',
  'map-count-default': 'map-count',
  'map-points-polygon-large': 'map-points',
  'map-count-polygon-large': 'map-count',
};

const DESCRIPTIONS: Record<BenchCombinationId, string> = {
  default: 'Orden por defecto (updatedAt desc), sin filtros, página 1.',
  'op-type': 'Filtro de operación (venta) y tipo (piso).',
  'price-range-rent': 'Alquiler con banda de precio, orden por precio ascendente.',
  'price-desc': 'Orden por precio descendente, sin filtros.',
  'surface-selective': 'Filtro de superficie mínima muy selectivo (≥300 m²).',
  'surface-sort': 'Banda de superficie media, orden por superficie ascendente.',
  'rooms-baths': 'Filtros combinados de habitaciones y baños mínimos.',
  'geo-1km': 'Filtro geográfico estrecho (1 km) sobre el centro de Madrid.',
  'geo-25km-price': 'Filtro geográfico amplio (25 km) con orden por precio ascendente.',
  'all-filters': 'Todos los filtros combinados a la vez, incluido un radio geográfico de 5 km.',
  'deep-default': 'Orden por defecto con paginación profunda (página 100).',
  'deep-filtered': 'Filtros de operación/tipo con orden por precio y paginación profunda (página 100).',
  'polygon-small': 'Lista con polígono de ≈1 km² en el centro de Madrid (índice GiST de geography).',
  'polygon-large-price': 'Lista con polígono de ≈2.400 km² sobre Madrid, orden por precio ascendente.',
  'polygon-sparse': 'Lista con polígono de ≈2.400 km² en zona dispersa, orden por defecto (sonda de la trampa del LIMIT).',
  'map-points-default': 'Puntos del mapa (LIMIT 501) sin filtros.',
  'map-count-default': 'Recuento M de viviendas con ubicación, sin filtros.',
  'map-points-polygon-large': 'Puntos del mapa (LIMIT 501) con polígono de ≈2.400 km² sobre Madrid.',
  'map-count-polygon-large': 'Recuento M con polígono de ≈2.400 km² sobre Madrid.',
};

export const BENCH_COMBINATIONS: readonly BenchCombination[] = BENCH_COMBINATION_IDS.map((id) => ({
  id,
  description: DESCRIPTIONS[id],
  kind: KINDS[id],
  criteria: CRITERIA[id],
}));

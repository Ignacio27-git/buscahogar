// ROADMAP 2.4 (search-indexing-performance) — query-matrix.ts (diseño,
// sección "Query Matrix"; fase 2, tarea 2.2). Enumera, como literales
// `PropertySearchCriteria`, las combinaciones que `scripts/bench-search.ts`
// mide contra `buildPropertySearchQuery` (`@buscahogar/db`). Módulo PURO:
// ninguna función de este fichero abre conexión ni lee `process.env`.
//
// Reutiliza `BENCH_COMBINATION_IDS` de `bench-options.ts` (fase 1, tarea
// 1.4) en vez de declarar su propia lista de ids — ese fichero ya la
// necesitaba para validar `--only` antes de que este módulo existiera
// (diseño, tabla de ficheros: "query-matrix.ts importará esta misma
// constante en vez de duplicar la lista"). `CRITERIA`/`DESCRIPTIONS` están
// tipados como `Record<BenchCombinationId, …>`: al TypeScript exigir las 12
// claves exactas, olvidar una combinación o escribir un id inexistente es
// un error de compilación, no un hueco silencioso en la matriz.
import type { PropertySearchCriteria } from '@buscahogar/core';

import { BENCH_COMBINATION_IDS } from './bench-options.js';
import type { BenchCombinationId } from './bench-options.js';

export interface BenchCombination {
  readonly id: BenchCombinationId;
  readonly description: string;
  readonly criteria: PropertySearchCriteria;
}

// Centro de Madrid (diseño, "Corpus Shape": "60% Madrid (-3.7038, 40.4168)")
// — mismas coordenadas que `corpus-sql.ts`, para que los filtros geográficos
// de esta matriz sí encuentren filas del corpus sintético cerca del centro.
const MADRID_LON = -3.7038;
const MADRID_LAT = 40.4168;

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
};

export const BENCH_COMBINATIONS: readonly BenchCombination[] = BENCH_COMBINATION_IDS.map((id) => ({
  id,
  description: DESCRIPTIONS[id],
  criteria: CRITERIA[id],
}));

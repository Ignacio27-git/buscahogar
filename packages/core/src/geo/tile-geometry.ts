// Geometría Web Mercator (EPSG:3857) pura para el mosaico estático de la
// ficha (D.11, decisión 179). Sin Next ni ORM: el servidor solo calcula qué
// teselas y qué círculo dibujar; el navegador es quien pide las teselas (R8).
//
// Usa el radio de la esfera de Web Mercator (6 378 137 m), NO el de
// `haversineDistanceMeters` (6 371 000 m): las teselas están en 3857 y la
// proyección es conforme, así que un círculo en píxeles equivale a un círculo
// en el terreno a esa latitud.
import type { Coordinates } from '../types/coordinates.js';

export const TILE_SIZE_PX = 256;
export const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
// Provisional (decisión 179): no hay señal de ofuscación (026) con la que
// fijarlo con datos reales, como pedía la 133.
export const APPROXIMATE_LOCATION_RADIUS_M = 500;

const EARTH_RADIUS_WEB_MERCATOR_M = 6_378_137;
const MAX_ZOOM = 19;
// Tope del desplazamiento dentro de la tesela cuando el recorte de fila la
// deja justo en el borde inferior del mundo.
const OFFSET_UPPER_BOUND = TILE_SIZE_PX - 1e-6;

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface TileCoordinate {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface StaticMapTile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export interface StaticMapPlan {
  readonly widthPx: number;
  readonly heightPx: number;
  // Orden de filas: la primera fila de izquierda a derecha, luego la segunda.
  readonly tiles: readonly StaticMapTile[];
  // En píxeles del mosaico, redondeado a 0,1.
  readonly area: { readonly cx: number; readonly cy: number; readonly r: number };
}

function assertZoom(zoom: number): void {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > MAX_ZOOM) {
    throw new RangeError(`zoom debe ser un entero entre 0 y ${String(MAX_ZOOM)}: ${String(zoom)}`);
  }
}

function assertCoordinates(point: Coordinates): void {
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RangeError('latitud y longitud deben ser finitas');
  }
  if (Math.abs(latitude) > 90) throw new RangeError(`latitud fuera de rango: ${String(latitude)}`);
  if (Math.abs(longitude) > 180) throw new RangeError(`longitud fuera de rango: ${String(longitude)}`);
}

function clampLatitude(latitude: number): number {
  return Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
}

// Píxel de mundo a `zoom`: longitud normalizada a [-180, 180) (180 -> -180,
// x = 0) y latitud recortada a ±85,05112878 (89 y -90 no lanzan).
export function projectToWorldPixel(point: Coordinates, zoom: number): PixelPoint {
  assertZoom(zoom);
  assertCoordinates(point);
  const size = TILE_SIZE_PX * 2 ** zoom;
  const longitude = ((((point.longitude + 180) % 360) + 360) % 360) - 180;
  const sin = Math.sin((clampLatitude(point.latitude) * Math.PI) / 180);
  const x = ((longitude + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return { x, y: Math.max(0, Math.min(size, y)) };
}

// Tesela que contiene el punto y desplazamiento en píxeles dentro de ella.
export function latLonToTile(point: Coordinates, zoom: number): TileCoordinate {
  const world = projectToWorldPixel(point, zoom);
  const lastIndex = 2 ** zoom - 1;
  const x = Math.min(Math.floor(world.x / TILE_SIZE_PX), lastIndex);
  const y = Math.min(Math.floor(world.y / TILE_SIZE_PX), lastIndex);
  return {
    z: zoom,
    x,
    y,
    offsetX: Math.min(world.x - x * TILE_SIZE_PX, OFFSET_UPPER_BOUND),
    offsetY: Math.min(world.y - y * TILE_SIZE_PX, OFFSET_UPPER_BOUND),
  };
}

// Resolución del terreno en m/px: 2πR·cos(lat) / (256·2^z).
export function metresPerPixel(latitude: number, zoom: number): number {
  assertZoom(zoom);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new RangeError(`latitud fuera de rango: ${String(latitude)}`);
  }
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  return (2 * Math.PI * EARTH_RADIUS_WEB_MERCATOR_M * Math.cos(radians)) / (TILE_SIZE_PX * 2 ** zoom);
}

function assertWindow(name: string, value: number, zoom: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 2 ** zoom) {
    throw new RangeError(`${name} debe ser un entero entre 1 y 2^zoom: ${String(value)}`);
  }
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

// Ventana alineada a teselas: el punto cae siempre en [128, 384) px de un
// mosaico de 2x2 (inicio = floor(p/256 - n/2 + 0.5)). Las columnas envuelven
// en el antimeridiano; la fila inicial se recorta a [0, 2^z - filas].
export function planStaticMap(req: {
  readonly center: Coordinates;
  readonly radiusMetres: number;
  readonly zoom: number;
  readonly columns: number;
  readonly rows: number;
}): StaticMapPlan {
  const { center, radiusMetres, zoom, columns, rows } = req;
  const world = projectToWorldPixel(center, zoom);
  assertWindow('columns', columns, zoom);
  assertWindow('rows', rows, zoom);
  if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) {
    throw new RangeError(`radiusMetres debe ser finito y mayor que 0: ${String(radiusMetres)}`);
  }
  const count = 2 ** zoom;
  const startColumn = Math.floor(world.x / TILE_SIZE_PX - columns / 2 + 0.5);
  const startRow = Math.max(0, Math.min(count - rows, Math.floor(world.y / TILE_SIZE_PX - rows / 2 + 0.5)));
  const tiles: StaticMapTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({ z: zoom, x: (((startColumn + column) % count) + count) % count, y: startRow + row });
    }
  }
  return {
    widthPx: columns * TILE_SIZE_PX,
    heightPx: rows * TILE_SIZE_PX,
    tiles,
    area: {
      cx: round1(world.x - startColumn * TILE_SIZE_PX),
      cy: round1(world.y - startRow * TILE_SIZE_PX),
      r: round1(radiusMetres / metresPerPixel(center.latitude, zoom)),
    },
  };
}

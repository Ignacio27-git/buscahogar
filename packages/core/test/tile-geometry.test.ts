import { describe, expect, it } from 'vitest';

import type { Coordinates } from '../src/types/coordinates.js';
import {
  APPROXIMATE_LOCATION_RADIUS_M,
  TILE_SIZE_PX,
  WEB_MERCATOR_MAX_LATITUDE,
  latLonToTile,
  metresPerPixel,
  planStaticMap,
  projectToWorldPixel,
  type StaticMapPlan,
} from '../src/geo/tile-geometry.js';

// D.11 (decisión 179): geometría Web Mercator pura para el mosaico estático
// de la ficha. Las anclas exactas son solo las que se conocen de forma
// independiente (0,0 en z1; ecuador a z0); el resto son invariantes.
const p = (latitude: number, longitude: number): Coordinates => ({ latitude, longitude });

// Inversa de la proyección: posición fraccionaria en el mundo -> coordenadas.
function fromWorld(worldX: number, worldY: number, zoom: number): Coordinates {
  const size = TILE_SIZE_PX * 2 ** zoom;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / size))) * 180) / Math.PI;
  return { latitude, longitude: (worldX / size) * 360 - 180 };
}

describe('projectToWorldPixel', () => {
  it('0,0 cae en el centro del mundo: (128·2^z, 128·2^z)', () => {
    for (const z of [0, 1, 7, 14]) {
      const px = projectToWorldPixel(p(0, 0), z);
      expect(px.x).toBeCloseTo(128 * 2 ** z, 6);
      expect(px.y).toBeCloseTo(128 * 2 ** z, 6);
    }
  });

  it('longitud: -180 -> x 0; 180 se normaliza a -180 -> x 0; 179.999 queda justo por debajo del ancho', () => {
    const size = TILE_SIZE_PX * 2 ** 10;
    expect(projectToWorldPixel(p(0, -180), 10).x).toBe(0);
    expect(projectToWorldPixel(p(0, 180), 10).x).toBe(0);
    const near = projectToWorldPixel(p(0, 179.999), 10).x;
    expect(near).toBeLessThan(size);
    expect(near).toBeGreaterThan(size - 1);
  });

  it('latitud: 85.0511 -> y≈0; 89 y 90 se recortan igual; -90 -> ≈ancho; ninguna lanza', () => {
    const size = TILE_SIZE_PX * 2 ** 8;
    const top = projectToWorldPixel(p(WEB_MERCATOR_MAX_LATITUDE, 0), 8).y;
    expect(top).toBeCloseTo(0, 4);
    expect(projectToWorldPixel(p(89, 0), 8).y).toBe(top);
    expect(projectToWorldPixel(p(90, 0), 8).y).toBe(top);
    expect(projectToWorldPixel(p(-90, 0), 8).y).toBeCloseTo(size, 4);
  });

  it('RangeError: no finito, |lat| > 90, |lon| > 180, zoom no entero o fuera de 0..19', () => {
    expect(() => projectToWorldPixel(p(Number.NaN, 0), 5)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(0, Number.POSITIVE_INFINITY), 5)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(90.0001, 0), 5)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(0, -180.0001), 5)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(0, 0), 20)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(0, 0), 1.5)).toThrow(RangeError);
    expect(() => projectToWorldPixel(p(0, 0), -1)).toThrow(RangeError);
  });
});

describe('latLonToTile', () => {
  it('0,0 en z1 -> tesela (1,1) con desplazamiento (0,0)', () => {
    expect(latLonToTile(p(0, 0), 1)).toEqual({ z: 1, x: 1, y: 1, offsetX: 0, offsetY: 0 });
  });

  it('el desplazamiento está en [0,256) y tesela·256 + desplazamiento reproduce el píxel de mundo', () => {
    for (const [lat, lon, z] of [
      [40.3063, -3.7324, 14],
      [27.6, -15.4, 12],
      [43.8, 3.2, 19],
      [-33.9, 151.2, 9],
    ] as const) {
      const t = latLonToTile(p(lat, lon), z);
      const world = projectToWorldPixel(p(lat, lon), z);
      expect(t.offsetX).toBeGreaterThanOrEqual(0);
      expect(t.offsetX).toBeLessThan(256);
      expect(t.offsetY).toBeGreaterThanOrEqual(0);
      expect(t.offsetY).toBeLessThan(256);
      expect(t.x * 256 + t.offsetX).toBeCloseTo(world.x, 6);
      expect(t.y * 256 + t.offsetY).toBeCloseTo(world.y, 6);
    }
  });

  it('lon ±180 -> x 0; lat 89/90/-90 dan índices válidos sin lanzar', () => {
    expect(latLonToTile(p(0, -180), 3).x).toBe(0);
    expect(latLonToTile(p(0, 180), 3).x).toBe(0);
    for (const lat of [89, 90, -90]) {
      const t = latLonToTile(p(lat, 0), 3);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(7);
      expect(Number.isFinite(t.offsetY)).toBe(true);
      expect(t.offsetY).toBeLessThan(256);
    }
  });
});

describe('metresPerPixel', () => {
  it('ecuador a z0 ≈ 156543.03 m/px y a 60° es la mitad', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
    expect(metresPerPixel(60, 0)).toBeCloseTo(metresPerPixel(0, 0) / 2, 6);
  });

  it('cada zoom divide la resolución por dos', () => {
    expect(metresPerPixel(40, 15)).toBeCloseTo(metresPerPixel(40, 14) / 2, 9);
  });
});

describe('planStaticMap', () => {
  const plan = (center: Coordinates, zoom = 14, columns = 2, rows = 2, radiusMetres = 500): StaticMapPlan =>
    planStaticMap({ center, radiusMetres, zoom, columns, rows });

  it('el radio provisional de decisión 179 es 500 m', () => {
    expect(APPROXIMATE_LOCATION_RADIUS_M).toBe(500);
  });

  it('zoom 0: 1x1 -> solo la tesela (0,0); 2x1, 1x2 y (3x1 en z1) lanzan RangeError', () => {
    expect(plan(p(10, 10), 0, 1, 1).tiles).toEqual([{ z: 0, x: 0, y: 0 }]);
    expect(() => plan(p(10, 10), 0, 2, 1)).toThrow(RangeError);
    expect(() => plan(p(10, 10), 0, 1, 2)).toThrow(RangeError);
    expect(() => plan(p(10, 10), 1, 3, 1)).toThrow(RangeError);
  });

  it('RangeError: columnas/filas no enteras o < 1, radio no finito o <= 0', () => {
    expect(() => plan(p(10, 10), 14, 0, 2)).toThrow(RangeError);
    expect(() => plan(p(10, 10), 14, 2, 1.5)).toThrow(RangeError);
    expect(() => plan(p(10, 10), 14, 2, 2, 0)).toThrow(RangeError);
    expect(() => plan(p(10, 10), 14, 2, 2, Number.NaN)).toThrow(RangeError);
  });

  it('P1 (40.3063, -3.7324) a z14, 2x2: teselas 8021/8022 x 6183/6184 en orden de filas y círculo calculado', () => {
    const result = plan(p(40.3063, -3.7324));
    expect(result.widthPx).toBe(512);
    expect(result.heightPx).toBe(512);
    expect(result.tiles).toEqual([
      { z: 14, x: 8021, y: 6183 },
      { z: 14, x: 8022, y: 6183 },
      { z: 14, x: 8021, y: 6184 },
      { z: 14, x: 8022, y: 6184 },
    ]);
    expect(result.area.cx).toBeCloseTo(290.4, 1);
    expect(result.area.cy).toBeCloseTo(359.0, 1);
    expect(result.area.r).toBeCloseTo(68.6, 1);
  });

  it('barrido de invariantes: círculo dentro de 512² con >= 48 px de margen y centro en [128,384] (tras redondear a 0,1)', () => {
    for (const lat of [27.6, 36, 40.3, 43.8]) {
      for (const fx of [0, 0.4999, 0.5, 0.9999]) {
        for (const fy of [0, 0.4999, 0.5, 0.9999]) {
          const base = projectToWorldPixel(p(lat, -3.7), 14);
          const point = fromWorld(
            Math.floor(base.x / 256) * 256 + fx * 256,
            Math.floor(base.y / 256) * 256 + fy * 256,
            14
          );
          const { area } = plan(point);
          expect(area.cx).toBeGreaterThanOrEqual(128);
          expect(area.cx).toBeLessThanOrEqual(384);
          expect(area.cy).toBeGreaterThanOrEqual(128);
          expect(area.cy).toBeLessThanOrEqual(384);
          for (const v of [area.cx, area.cy]) {
            expect(v - area.r).toBeGreaterThanOrEqual(48);
            expect(v + area.r).toBeLessThanOrEqual(512 - 48);
          }
        }
      }
    }
  });

  it('antimeridiano: las columnas envuelven sin duplicar tesela', () => {
    const { tiles } = plan(p(0, 179.9999));
    const n = 2 ** 14;
    expect(tiles.map((t) => t.x)).toEqual([n - 1, 0, n - 1, 0]);
    expect(new Set(tiles.map((t) => `${String(t.x)}/${String(t.y)}`)).size).toBe(4);
  });

  it('polos: la fila inicial se recorta a [0, 2^z - filas]', () => {
    const north = plan(p(90, 10)).tiles.map((t) => t.y);
    expect(Math.min(...north)).toBe(0);
    const south = plan(p(-90, 10)).tiles.map((t) => t.y);
    expect(Math.max(...south)).toBe(2 ** 14 - 1);
  });
});

// ROADMAP 2.4 (search-indexing-performance) — query-matrix.test.ts (diseño,
// sección "Query Matrix"; fase 2, tarea 2.1). Comprueba que la matriz cubre
// EXACTAMENTE los 12 ids de `BENCH_COMBINATION_IDS` (bench-options.ts, fase
// 1) sin repetidos, y que un puñado de combinaciones representativas
// construyen el `PropertySearchCriteria` que el diseño describe para ellas
// — no solo que existan.
import { formatPolygonParam, parsePolygonParam, POLYGON_MAX_AREA_KM2, polygonAreaKm2, validatePolygonRing } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import { BENCH_COMBINATION_IDS } from '../../src/bench/bench-options.js';
import { BENCH_COMBINATIONS } from '../../src/bench/query-matrix.js';

describe('BENCH_COMBINATIONS (diseño, "Query Matrix")', () => {
  it('expone exactamente los 12 ids de BENCH_COMBINATION_IDS, cada uno una sola vez', () => {
    const ids = BENCH_COMBINATIONS.map((combination) => combination.id);
    expect(ids).toHaveLength(BENCH_COMBINATION_IDS.length);
    expect(new Set(ids).size).toBe(BENCH_COMBINATION_IDS.length);
    expect([...ids].sort()).toEqual([...BENCH_COMBINATION_IDS].sort());
  });

  it('cada combinación trae una descripción no vacía', () => {
    for (const combination of BENCH_COMBINATIONS) {
      expect(combination.description.length).toBeGreaterThan(0);
    }
  });

  it('"default" ordena por updatedAt desc, página 1, sin ningún filtro activo', () => {
    const combination = BENCH_COMBINATIONS.find((c) => c.id === 'default');
    expect(combination?.criteria).toEqual({ sort: 'updated', dir: 'desc', page: 1 });
  });

  it('"geo-1km" filtra por geografía con un radio de 1000 m sobre el centro de Madrid', () => {
    const combination = BENCH_COMBINATIONS.find((c) => c.id === 'geo-1km');
    expect(combination?.criteria.geo?.radiusMeters).toBe(1000);
    expect(combination?.criteria.geo?.lon).toBeCloseTo(-3.7038, 3);
    expect(combination?.criteria.geo?.lat).toBeCloseTo(40.4168, 3);
  });

  it('"geo-25km-price" combina un radio de 25000 m con orden por precio ascendente', () => {
    const combination = BENCH_COMBINATIONS.find((c) => c.id === 'geo-25km-price');
    expect(combination?.criteria.geo?.radiusMeters).toBe(25000);
    expect(combination?.criteria.sort).toBe('price');
    expect(combination?.criteria.dir).toBe('asc');
  });

  it('"deep-default" y "deep-filtered" piden la página 100 (paginación profunda)', () => {
    const deepDefault = BENCH_COMBINATIONS.find((c) => c.id === 'deep-default');
    const deepFiltered = BENCH_COMBINATIONS.find((c) => c.id === 'deep-filtered');
    expect(deepDefault?.criteria.page).toBe(100);
    expect(deepFiltered?.criteria.page).toBe(100);
    expect(deepFiltered?.criteria.operation).toBe('sale');
    expect(deepFiltered?.criteria.propertyType).toBe('flat');
  });

  it('"all-filters" combina operación, tipo, precio, superficie, habitaciones, baños y geo a la vez', () => {
    const combination = BENCH_COMBINATIONS.find((c) => c.id === 'all-filters');
    const criteria = combination?.criteria;
    expect(criteria?.operation).toBeDefined();
    expect(criteria?.propertyType).toBeDefined();
    expect(criteria?.minPriceCents).toBeDefined();
    expect(criteria?.maxPriceCents).toBeDefined();
    expect(criteria?.minSurfaceM2).toBeDefined();
    expect(criteria?.maxSurfaceM2).toBeDefined();
    expect(criteria?.minRooms).toBeDefined();
    expect(criteria?.minBathrooms).toBeDefined();
    expect(criteria?.geo).toBeDefined();
  });
});

// ROADMAP 2.6 (decisión 117, sección "Bench scenarios" del diseño): siete
// escenarios nuevos con `kind` (list | map-points | map-count). Las áreas se
// comprueban con `polygonAreaKm2` de core para que "≈1 km²" y "≈2.400 km²"
// sean hechos medidos, no comentarios.
describe('escenarios de polígono y mapa (ROADMAP 2.6)', () => {
  const NEW_IDS = [
    'polygon-small',
    'polygon-large-price',
    'polygon-sparse',
    'map-points-default',
    'map-count-default',
    'map-points-polygon-large',
    'map-count-polygon-large',
  ] as const;

  function find(id: (typeof NEW_IDS)[number]): (typeof BENCH_COMBINATIONS)[number] {
    const combination = BENCH_COMBINATIONS.find((c) => c.id === id);
    if (combination === undefined) {
      throw new Error(`Escenario ausente en la matriz: ${id}`);
    }
    return combination;
  }

  it('los 7 ids nuevos existen y la matriz suma 19 escenarios sin repetidos', () => {
    for (const id of NEW_IDS) {
      expect(BENCH_COMBINATION_IDS).toContain(id);
      expect(find(id).id).toBe(id);
    }
    expect(BENCH_COMBINATIONS).toHaveLength(19);
  });

  it('los 12 escenarios anteriores siguen siendo kind "list"', () => {
    const previous = BENCH_COMBINATIONS.filter((c) => !(NEW_IDS as readonly string[]).includes(c.id));
    expect(previous).toHaveLength(12);
    for (const combination of previous) {
      expect(combination.kind).toBe('list');
    }
  });

  it('asigna el kind del diseño a cada escenario nuevo', () => {
    expect(find('polygon-small').kind).toBe('list');
    expect(find('polygon-large-price').kind).toBe('list');
    expect(find('polygon-sparse').kind).toBe('list');
    expect(find('map-points-default').kind).toBe('map-points');
    expect(find('map-count-default').kind).toBe('map-count');
    expect(find('map-points-polygon-large').kind).toBe('map-points');
    expect(find('map-count-polygon-large').kind).toBe('map-count');
  });

  it('polygon-small ronda 1 km² en el centro de Madrid', () => {
    const ring = find('polygon-small').criteria.polygon;
    expect(ring).toBeDefined();
    const area = polygonAreaKm2(ring ?? []);
    expect(area).toBeGreaterThan(0.9);
    expect(area).toBeLessThan(1.1);
    for (const vertex of ring ?? []) {
      expect(vertex.lat).toBeCloseTo(40.4168, 1);
      expect(vertex.lon).toBeCloseTo(-3.7038, 1);
    }
  });

  it('los polígonos grandes rondan 2.400 km² y respetan el tope de 2.500 km²', () => {
    for (const id of ['polygon-large-price', 'polygon-sparse', 'map-points-polygon-large', 'map-count-polygon-large'] as const) {
      const ring = find(id).criteria.polygon;
      const area = polygonAreaKm2(ring ?? []);
      expect(area, id).toBeGreaterThan(2300);
      expect(area, id).toBeLessThanOrEqual(POLYGON_MAX_AREA_KM2);
    }
  });

  it('todos los polígonos son válidos según core (mismas reglas que la URL)', () => {
    for (const id of NEW_IDS) {
      const ring = find(id).criteria.polygon;
      if (ring !== undefined) {
        expect(validatePolygonRing(ring), id).toBeNull();
      }
    }
  });

  it('cada polígono del banco sobrevive al viaje de ida y vuelta por la URL (format -> parse)', () => {
    for (const id of NEW_IDS) {
      const ring = find(id).criteria.polygon;
      if (ring !== undefined) {
        const parsed = parsePolygonParam(formatPolygonParam(ring));
        expect(parsed.ok, id).toBe(true);
        if (parsed.ok) {
          expect(parsed.ring, id).toEqual(ring);
        }
      }
    }
  });

  it('polygon-large-price ordena por precio ascendente y polygon-sparse usa el orden por defecto', () => {
    expect(find('polygon-large-price').criteria.sort).toBe('price');
    expect(find('polygon-large-price').criteria.dir).toBe('asc');
    expect(find('polygon-sparse').criteria.sort).toBe('updated');
    expect(find('polygon-sparse').criteria.dir).toBe('desc');
  });

  it('polygon-sparse queda lejos del centro de Madrid (sonda de la trampa del LIMIT)', () => {
    const ring = find('polygon-sparse').criteria.polygon ?? [];
    const meanLat = ring.reduce((sum, v) => sum + v.lat, 0) / ring.length;
    expect(Math.abs(meanLat - 40.4168)).toBeGreaterThan(1);
  });

  it('los pares points/count comparten criterios (M cuenta lo mismo que los puntos)', () => {
    expect(find('map-points-default').criteria).toEqual(find('map-count-default').criteria);
    expect(find('map-points-polygon-large').criteria).toEqual(find('map-count-polygon-large').criteria);
    expect(find('map-points-default').criteria.polygon).toBeUndefined();
    expect(find('map-points-polygon-large').criteria.polygon).toBeDefined();
  });
});

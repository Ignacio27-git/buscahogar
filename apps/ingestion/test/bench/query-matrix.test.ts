// ROADMAP 2.4 (search-indexing-performance) — query-matrix.test.ts (diseño,
// sección "Query Matrix"; fase 2, tarea 2.1). Comprueba que la matriz cubre
// EXACTAMENTE los 12 ids de `BENCH_COMBINATION_IDS` (bench-options.ts, fase
// 1) sin repetidos, y que un puñado de combinaciones representativas
// construyen el `PropertySearchCriteria` que el diseño describe para ellas
// — no solo que existan.
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

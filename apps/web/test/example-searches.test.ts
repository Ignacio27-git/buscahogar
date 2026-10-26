// D.22 (decisión 268, HH-2) — las búsquedas de ejemplo de la portada son enlaces GET por criterios,
// nunca por zona: una zona registraría un `coverage_job` y gastaría cuota si un rastreador siguiera
// los enlaces. Aquí se fija que cada una es válida para el esquema real y que no arrastra nada más.
import { searchQuerySchema } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import { EXAMPLE_SEARCHES, exampleSearchHref } from '../src/lib/example-searches.js';

// Los campos de criterio de la barra de filtros (`FIELD_KEYS` de filter-bar.tsx).
const FILTER_BAR_KEYS = [
  'operation',
  'propertyType',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'minBathrooms',
] as const;

const FORBIDDEN_KEYS = ['zone', 'zoneQuery', 'polygon', 'lat', 'lng', 'radius', 'q', 'page', 'view', 'form'] as const;

describe('EXAMPLE_SEARCHES (D.22, HH-2)', () => {
  it('hay entre 4 y 8 ejemplos, con rótulos distintos', () => {
    expect(EXAMPLE_SEARCHES.length).toBeGreaterThanOrEqual(4);
    expect(EXAMPLE_SEARCHES.length).toBeLessThanOrEqual(8);
    const labels = EXAMPLE_SEARCHES.map((search) => search.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label.trim()).not.toBe('');
    }
  });

  // Bajo 30rem solo se ven los tres primeros (CSS): han de ser los más útiles y equilibrar alquiler y venta.
  it('los tres primeros son los que se ven a 320 px: alquiler con tope, venta con tope y venta por habitaciones', () => {
    expect(EXAMPLE_SEARCHES.slice(0, 3).map((search) => search.label)).toEqual([
      'Pisos en alquiler hasta 900 €',
      'Venta hasta 250.000 €',
      'Venta con 3 habitaciones o más',
    ]);
    expect(EXAMPLE_SEARCHES.map((search) => search.label)).toContain('Áticos en venta');
  });

  it.each(EXAMPLE_SEARCHES.map((search) => [search.label, search] as const))(
    '%s: sus parámetros pasan searchQuerySchema',
    (_label, search) => {
      const result = searchQuerySchema.safeParse(search.params);
      expect(result.success).toBe(true);
    }
  );

  it('solo usa claves de la barra de filtros y ninguna geográfica, de texto ni de paginación', () => {
    for (const search of EXAMPLE_SEARCHES) {
      const keys = Object.keys(search.params);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(FILTER_BAR_KEYS as readonly string[], `${search.label}: ${key}`).toContain(key);
        expect(FORBIDDEN_KEYS as readonly string[]).not.toContain(key);
      }
    }
  });

  it('el href es «/?» más los parámetros codificados, sin el valor vacío ni la marca de formulario', () => {
    for (const search of EXAMPLE_SEARCHES) {
      const href = exampleSearchHref(search);
      expect(href.startsWith('/?')).toBe(true);
      const query = new URLSearchParams(href.slice(2));
      expect(Object.fromEntries(query)).toEqual(search.params);
      for (const [, value] of query) {
        expect(value).not.toBe('');
      }
    }
  });

  it('dos ejemplos no comparten el mismo conjunto de criterios', () => {
    const hrefs = EXAMPLE_SEARCHES.map(exampleSearchHref);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

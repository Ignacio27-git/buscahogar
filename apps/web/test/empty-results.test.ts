// D.14 (decisión 190) — alcance de los filtros del estado vacío y elección del tipo de mensaje.
// Lógica pura: se prueba sin renderizar.
import { describe, expect, it } from 'vitest';

import { scopeEmptyResultsFilters, selectEmptyResultsKind } from '../src/lib/empty-results.js';
import type { AppliedFilter } from '../src/lib/search-labels.js';

const OPERATION: AppliedFilter = { key: 'operation', label: 'Operación: Venta' };
const TYPE: AppliedFilter = { key: 'propertyType', label: 'Tipo: Piso' };
const ZONE: AppliedFilter = { key: 'zone', label: 'Zona INE 28079' };
const POLYGON: AppliedFilter = { key: 'polygon', label: 'Zona dibujada' };

describe('scopeEmptyResultsFilters', () => {
  it('quita el polígono vacío y lo conserva al limpiar', () => {
    expect(
      scopeEmptyResultsFilters({ filters: [OPERATION, POLYGON], polygonEmpty: true, zoneUnapplied: false })
    ).toEqual({ filters: [OPERATION], keepOnClear: ['polygon'] });
  });

  it('quita la zona sin aplicar y conserva zone y zoneQuery al limpiar', () => {
    expect(
      scopeEmptyResultsFilters({ filters: [ZONE, OPERATION, TYPE], polygonEmpty: false, zoneUnapplied: true })
    ).toEqual({ filters: [OPERATION, TYPE], keepOnClear: ['zone', 'zoneQuery'] });
  });

  it('no toca una zona aplicada ni un polígono con resultados', () => {
    expect(
      scopeEmptyResultsFilters({ filters: [ZONE, OPERATION], polygonEmpty: false, zoneUnapplied: false })
    ).toEqual({ filters: [ZONE, OPERATION], keepOnClear: [] });
    expect(
      scopeEmptyResultsFilters({ filters: [POLYGON], polygonEmpty: false, zoneUnapplied: false })
    ).toEqual({ filters: [POLYGON], keepOnClear: [] });
  });

  it('maneja los dos a la vez aunque el esquema no lo permita', () => {
    expect(
      scopeEmptyResultsFilters({ filters: [ZONE, POLYGON, OPERATION], polygonEmpty: true, zoneUnapplied: true })
    ).toEqual({ filters: [OPERATION], keepOnClear: ['polygon', 'zone', 'zoneQuery'] });
  });
});

describe('selectEmptyResultsKind — precedencia', () => {
  it('polígono vacío con otros filtros: filtered', () => {
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: true, filters: [OPERATION] })).toBe('filtered');
  });

  it('polígono vacío solo: nada (basta el aviso), también con page > 1', () => {
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: true, filters: [] })).toBeNull();
    expect(selectEmptyResultsKind({ page: 4, polygonEmpty: true, filters: [] })).toBeNull();
  });

  it('polígono vacío con otros filtros no pasa a past-last-page aunque page > 1', () => {
    expect(selectEmptyResultsKind({ page: 3, polygonEmpty: true, filters: [OPERATION] })).toBe('filtered');
  });

  it('page > 1 sin polígono vacío: past-last-page, con o sin filtros', () => {
    expect(selectEmptyResultsKind({ page: 2, polygonEmpty: false, filters: [OPERATION] })).toBe('past-last-page');
    expect(selectEmptyResultsKind({ page: 99, polygonEmpty: false, filters: [] })).toBe('past-last-page');
  });

  it('page 1 con filtros: filtered; sin filtros: unfiltered', () => {
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: false, filters: [OPERATION, TYPE] })).toBe('filtered');
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: false, filters: [] })).toBe('unfiltered');
  });
});

describe('alcance y tipo juntos', () => {
  it('el filtered nunca contiene el polígono ni la zona sin aplicar', () => {
    const polygonCase = scopeEmptyResultsFilters({
      filters: [OPERATION, POLYGON],
      polygonEmpty: true,
      zoneUnapplied: false,
    });
    const zoneCase = scopeEmptyResultsFilters({ filters: [ZONE, OPERATION], polygonEmpty: false, zoneUnapplied: true });

    for (const scoped of [polygonCase, zoneCase]) {
      expect(selectEmptyResultsKind({ page: 1, polygonEmpty: scoped === polygonCase, filters: scoped.filters })).toBe(
        'filtered'
      );
      expect(scoped.filters.map((filter) => filter.key)).toEqual(['operation']);
    }
  });

  it('zona sin aplicar sola: el alcance la deja sin filtros y el tipo es unfiltered', () => {
    const scoped = scopeEmptyResultsFilters({ filters: [ZONE], polygonEmpty: false, zoneUnapplied: true });

    expect(scoped.filters).toEqual([]);
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: false, filters: scoped.filters })).toBe('unfiltered');
  });
});

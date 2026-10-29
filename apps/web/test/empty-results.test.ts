// D.14 (decisión 190) — alcance de los filtros del estado vacío y elección del tipo de mensaje.
// Lógica pura: se prueba sin renderizar.
import { describe, expect, it } from 'vitest';

import { scopeEmptyResultsFilters, selectEmptyResultsKind } from '../src/lib/empty-results.js';
import type { AppliedFilter } from '../src/lib/search-labels.js';

const OPERATION: AppliedFilter = { key: 'operation', label: 'Operación: Venta' };
const TYPE: AppliedFilter = { key: 'propertyType', label: 'Tipo: Piso' };
const ZONE: AppliedFilter = { key: 'zone', label: 'Zona INE 28079' };
const POLYGON: AppliedFilter = { key: 'polygon', label: 'Zona dibujada' };

// D.18 (decisión 224, enmienda la 190): una zona con centroide y radio siempre se aplica, así que el
// alcance solo trata el polígono vacío. Una zona deja de ser «sin aplicar» y se puede quitar.
describe('scopeEmptyResultsFilters', () => {
  it('quita el polígono vacío y lo conserva al limpiar', () => {
    expect(scopeEmptyResultsFilters({ filters: [OPERATION, POLYGON], polygonEmpty: true })).toEqual({
      filters: [OPERATION],
      keepOnClear: ['polygon'],
    });
  });

  it('no toca la zona: es un filtro aplicado más, también con polígono vacío', () => {
    expect(scopeEmptyResultsFilters({ filters: [ZONE, OPERATION, TYPE], polygonEmpty: false })).toEqual({
      filters: [ZONE, OPERATION, TYPE],
      keepOnClear: [],
    });
    expect(scopeEmptyResultsFilters({ filters: [ZONE, POLYGON, OPERATION], polygonEmpty: true })).toEqual({
      filters: [ZONE, OPERATION],
      keepOnClear: ['polygon'],
    });
  });

  it('no toca un polígono con resultados', () => {
    expect(scopeEmptyResultsFilters({ filters: [POLYGON], polygonEmpty: false })).toEqual({
      filters: [POLYGON],
      keepOnClear: [],
    });
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
  it('el filtered nunca contiene el polígono vacío', () => {
    const scoped = scopeEmptyResultsFilters({ filters: [OPERATION, POLYGON], polygonEmpty: true });

    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: true, filters: scoped.filters })).toBe('filtered');
    expect(scoped.filters.map((filter) => filter.key)).toEqual(['operation']);
  });

  it('una zona sola cuenta como filtro: el tipo es filtered, no unfiltered', () => {
    const scoped = scopeEmptyResultsFilters({ filters: [ZONE], polygonEmpty: false });

    expect(scoped.filters).toEqual([ZONE]);
    expect(selectEmptyResultsKind({ page: 1, polygonEmpty: false, filters: scoped.filters })).toBe('filtered');
  });
});

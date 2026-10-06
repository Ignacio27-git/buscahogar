// D.6b (spec search-result-card, mobile-filter-tray) — rótulos de tipo y
// operación para la fila de resultado, y recuento de filtros de la bandeja.
// Funciones puras: sin red ni base de datos.
import { searchQuerySchema } from '@buscahogar/core';
import type { PropertySearchCriteria } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import { TRAY_FILTER_KEYS, countTrayFilters, operationLabel, propertyTypeLabel } from '../src/lib/search-labels.js';

function criteria(params: Record<string, string>): PropertySearchCriteria {
  return searchQuerySchema.parse(params);
}

describe('propertyTypeLabel / operationLabel — S1, S2 (decisión 134)', () => {
  it('devuelve el rótulo en español de un valor conocido', () => {
    expect(propertyTypeLabel('flat')).toBe('Piso');
    expect(propertyTypeLabel('storage_room')).toBe('Trastero');
    expect(operationLabel('sale')).toBe('Venta');
    expect(operationLabel('rent')).toBe('Alquiler');
  });

  it('null devuelve null: el texto de reserva es del componente', () => {
    expect(propertyTypeLabel(null)).toBeNull();
    expect(operationLabel(null)).toBeNull();
  });

  it('un valor desconocido devuelve null, nunca el valor crudo', () => {
    expect(propertyTypeLabel('castle')).toBeNull();
    expect(operationLabel('barter')).toBeNull();
  });

  it('no hereda claves del prototipo de Object', () => {
    expect(propertyTypeLabel('constructor')).toBeNull();
    expect(operationLabel('toString')).toBeNull();
  });
});

describe('countTrayFilters — S15 (decisión 154)', () => {
  it('sin filtros, cero', () => {
    expect(countTrayFilters(criteria({}))).toBe(0);
  });

  it('los ocho filtros de la bandeja suman ocho', () => {
    expect(
      countTrayFilters(
        criteria({
          operation: 'sale',
          propertyType: 'flat',
          minPrice: '150000',
          maxPrice: '300000',
          minSurface: '60',
          maxSurface: '120',
          minRooms: '2',
          minBathrooms: '1',
        })
      )
    ).toBe(8);
    expect(TRAY_FILTER_KEYS).toHaveLength(8);
  });

  it('sort y dir no cuentan', () => {
    expect(countTrayFilters(criteria({ sort: 'price', dir: 'asc' }))).toBe(0);
  });

  it('zona, polígono y punto con radio no cuentan', () => {
    expect(countTrayFilters(criteria({ zone: '28065' }))).toBe(0);
    expect(countTrayFilters(criteria({ polygon: '40.4,-3.7;40.4,-3.6;40.5,-3.6' }))).toBe(0);
    expect(countTrayFilters(criteria({ lat: '40.4', lng: '-3.7', radius: '500' }))).toBe(0);
  });

  it('mezcla: operación, precio máximo, orden y zona cuentan 2', () => {
    expect(countTrayFilters(criteria({ operation: 'sale', maxPrice: '300000', sort: 'price', zone: '28065' }))).toBe(2);
  });
});

// D.6a (spec search-filters) — etiquetas de los filtros aplicados y recuentos,
// y componentes de la barra de filtros y de los filtros aplicados. Funciones
// puras y `renderToStaticMarkup`: sin red ni base de datos.
import { searchQuerySchema } from '@buscahogar/core';
import type { PropertySearchCriteria } from '@buscahogar/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CriteriaFields } from '../src/components/criteria-fields.js';

import { describeAppliedFilters, formatListCount, formatMapCount } from '../src/lib/search-labels.js';

function criteria(params: Record<string, string>): PropertySearchCriteria {
  return searchQuerySchema.parse(params);
}

function labels(params: Record<string, string>, zoneName: string | null = null): string[] {
  return describeAppliedFilters(criteria(params), zoneName).map((filter) => filter.label);
}

describe('describeAppliedFilters — rótulos y orden (spec "Applied-filter chips")', () => {
  it('todos los filtros escalares, en el orden de la barra, con el valor real', () => {
    expect(
      labels({
        operation: 'sale',
        propertyType: 'flat',
        minPrice: '150000',
        maxPrice: '300000',
        minSurface: '60',
        maxSurface: '120',
        minRooms: '2',
        minBathrooms: '1',
      })
    ).toEqual([
      'Operación: Venta',
      'Tipo: Piso',
      'Precio desde 150.000 €',
      'Precio hasta 300.000 €',
      'Superficie desde 60 m²',
      'Superficie hasta 120 m²',
      'Habitaciones: 2 o más',
      'Baños: 1 o más',
    ]);
  });

  it('otra combinación: alquiler y casa, sin precio ni superficie', () => {
    expect(labels({ operation: 'rent', propertyType: 'house', minRooms: '3' })).toEqual([
      'Operación: Alquiler',
      'Tipo: Casa',
      'Habitaciones: 3 o más',
    ]);
  });

  it('sort y dir no generan filtro: sin parámetros de filtro no hay ninguno', () => {
    expect(labels({ sort: 'price', dir: 'asc' })).toEqual([]);
  });

  it('la clave de cada filtro es la que usa el constructor de href', () => {
    expect(describeAppliedFilters(criteria({ minRooms: '2', maxPrice: '900' }), null).map((f) => f.key)).toEqual([
      'maxPrice',
      'minRooms',
    ]);
  });

  it('zona con nombre resuelto', () => {
    expect(labels({ zone: '28065' }, 'Getafe')).toEqual(['Zona: Getafe']);
  });

  it('zona sin nombre resuelto: «Zona INE xxxxx»', () => {
    expect(labels({ zone: '28079' }, null)).toEqual(['Zona INE 28079']);
  });

  it('polígono dibujado: «Zona dibujada»', () => {
    expect(labels({ polygon: '40.4,-3.7;40.4,-3.6;40.5,-3.6' })).toEqual(['Zona dibujada']);
  });

  it('lat/lng/radius son UN solo filtro; menos de 1000 m se dice en metros', () => {
    const filters = describeAppliedFilters(criteria({ lat: '40.4', lng: '-3.7', radius: '500' }), null);
    expect(filters).toEqual([{ key: 'geo', label: 'A 500 m de un punto' }]);
  });

  it('desde 1000 m se dice en km, con un decimal como máximo y coma decimal', () => {
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '5000' })).toEqual(['A 5 km de un punto']);
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '1500' })).toEqual(['A 1,5 km de un punto']);
    expect(labels({ lat: '40.4', lng: '-3.7', radius: '1234' })).toEqual(['A 1,2 km de un punto']);
  });

  it('se describe `criteria`, no `effectiveCriteria`: una zona no produce chip de radio', () => {
    // La página deriva `geo` de una zona cubierta SOLO en `effectiveCriteria`.
    const filters = describeAppliedFilters(criteria({ zone: '28065' }), 'Getafe');
    expect(filters.map((filter) => filter.key)).toEqual(['zone']);
  });
});

describe('formatListCount — spec "Result count"', () => {
  it('página 1 sin página siguiente: recuento completo', () => {
    expect(formatListCount(7, 1, false)).toBe('7 resultados');
    expect(formatListCount(1, 1, false)).toBe('1 resultado');
  });

  it('cero resultados se dice igual', () => {
    expect(formatListCount(0, 1, false)).toBe('0 resultados');
  });

  it('con página siguiente es parcial y lleva el indicador de página', () => {
    const text = formatListCount(20, 1, true);
    expect(text).toContain('20 resultados en esta página');
    expect(text).toContain('página 1');
  });

  it('en la página 2 es parcial aunque no haya siguiente', () => {
    const text = formatListCount(3, 2, false);
    expect(text).toContain('3 resultados en esta página');
    expect(text).toContain('página 2');
  });
});

describe('formatMapCount', () => {
  it('singular y plural', () => {
    expect(formatMapCount(1)).toBe('1 vivienda con ubicación coincide');
    expect(formatMapCount(120)).toBe('120 viviendas con ubicación coinciden');
    expect(formatMapCount(0)).toBe('0 viviendas con ubicación coinciden');
  });
});

const FIELD_VALUES = { operation: 'rent', minPrice: '900', maxSurface: '120', sort: 'price', dir: 'asc' } as const;

// Spec «Shared fields»: el panel de `?q=` y la barra comparten los campos; solo
// cambia el prefijo de los ids (y el `for` de cada etiqueta).
describe('CriteriaFields — campos compartidos (spec "Shared fields", "Markup contract")', () => {
  const panel = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="criteria" />);
  const bar = renderToStaticMarkup(<CriteriaFields values={FIELD_VALUES} idPrefix="filter" />);

  it('con prefijo distinto el marcado es idéntico salvo ids y `for`', () => {
    expect(bar.replaceAll('filter-', 'criteria-')).toBe(panel);
    expect(bar).not.toBe(panel);
  });

  it('conserva ids criteria-<campo>, leyendas, nombres y valores prefijados', () => {
    for (const field of [
      'operation',
      'propertyType',
      'minPrice',
      'maxPrice',
      'minSurface',
      'maxSurface',
      'minRooms',
      'minBathrooms',
      'sort',
      'dir',
    ]) {
      expect(panel).toContain(`id="criteria-${field}"`);
      expect(panel).toContain(`for="criteria-${field}"`);
      expect(panel).toContain(`name="${field}"`);
    }
    expect(panel).toContain('<legend>Precio (€)</legend>');
    expect(panel).toContain('<legend>Superficie (m²)</legend>');
    expect(panel).toMatch(/<input[^>]*name="minPrice"[^>]*value="900"|<input[^>]*value="900"[^>]*name="minPrice"/);
  });

  it('el orden de los campos es el de la barra', () => {
    const order = ['operation', 'propertyType', 'minPrice', 'maxPrice', 'minSurface', 'maxSurface', 'minRooms', 'minBathrooms', 'sort', 'dir'];
    const positions = order.map((field) => panel.indexOf(`name="${field}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

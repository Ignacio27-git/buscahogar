// Paso 1.6 — forma de la petición de búsqueda, construida de forma pura a
// partir de AreaQuery + filtro + página (mismo patrón que
// probe-request-shape.test.ts del paso 1.5, pero ahora la petición depende
// del área real, no de un perfil fijo).
import { describe, expect, it } from 'vitest';

import type { AreaQuery } from '@buscahogar/core';

import { IDEALISTA_FILTERS } from '../src/sources/idealista/filters.js';
import { buildSearchFields, toFormData } from '../src/sources/idealista/search-request.js';

const AREA: AreaQuery = {
  center: { latitude: 40.43, longitude: -3.702 },
  radiusMeters: 500,
  operation: 'sale',
};

describe('buildSearchFields', () => {
  it.each(IDEALISTA_FILTERS)('produce exactamente los seis campos esperados para el filtro "%s"', (filter) => {
    const fields = buildSearchFields(AREA, filter, 2);
    expect(fields).toEqual([
      { name: 'center', value: '40.43,-3.702' },
      { name: 'distance', value: '500' },
      { name: 'propertyType', value: filter },
      { name: 'operation', value: 'sale' },
      { name: 'maxItems', value: '50' },
      { name: 'numPage', value: '2' },
    ]);
  });

  it('redondea distance (radiusMeters) a un entero', () => {
    const fields = buildSearchFields({ ...AREA, radiusMeters: 299.6 }, 'homes', 1);
    expect(fields.find((field) => field.name === 'distance')?.value).toBe('300');
  });

  it('acepta un maxItemsPerPage explícito distinto del valor por defecto', () => {
    const fields = buildSearchFields(AREA, 'homes', 1, 25);
    expect(fields.find((field) => field.name === 'maxItems')?.value).toBe('25');
  });

  it('usa el vocabulario de la petición (nombre del filtro), nunca el de la respuesta', () => {
    const fields = buildSearchFields(AREA, 'premises', 1);
    // "premises" (petición) nunca se confunde con "premise" (respuesta,
    // DECISIONS 027): el valor enviado es literalmente el nombre del filtro.
    expect(fields.find((field) => field.name === 'propertyType')?.value).toBe('premises');
  });
});

describe('toFormData', () => {
  it('produce exactamente las entradas de buildSearchFields, como cadenas', () => {
    const fields = buildSearchFields(AREA, 'premises', 3);
    const formData = toFormData(fields);
    expect([...formData.keys()]).toHaveLength(fields.length);
    for (const field of fields) {
      expect(formData.get(field.name)).toBe(field.value);
    }
  });
});

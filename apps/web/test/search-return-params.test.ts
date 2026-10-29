// D.9 (decisión 171) — selección de los parámetros de búsqueda que viajan al
// enlace de la ficha. Función pura y sin esquemas: la importa el mapa (cliente).
import { describe, expect, it } from 'vitest';

import { FILTER_PARAM_KEYS } from '../src/lib/search-href.js';
import { pickSearchReturnParams } from '../src/lib/search-return-params.js';

describe('pickSearchReturnParams — D.9', () => {
  it('conserva las claves de filtro, sort, dir y view', () => {
    const picked = pickSearchReturnParams(
      { operation: 'sale', minPrice: '100000', sort: 'price', dir: 'asc', view: 'list' },
      { includePage: false }
    );
    expect(picked).toEqual([
      ['operation', 'sale'],
      ['minPrice', '100000'],
      ['sort', 'price'],
      ['dir', 'asc'],
      ['view', 'list'],
    ]);
  });

  it('cubre todas las claves de FILTER_PARAM_KEYS (derivadas, no copiadas)', () => {
    const all: Record<string, string> = {};
    for (const key of Object.values(FILTER_PARAM_KEYS).flat()) {
      all[key] = 'x';
    }
    const keys = pickSearchReturnParams(all, { includePage: false }).map(([key]) => key);
    expect(keys).toEqual(Object.values(FILTER_PARAM_KEYS).flat());
    expect(keys).toContain('lat');
    expect(keys).toContain('polygon');
  });

  it('emite siempre el orden canónico, sea cual sea el de entrada', () => {
    const picked = pickSearchReturnParams(
      { view: 'map', sort: 'price', minPrice: '1', operation: 'rent' },
      { includePage: false }
    );
    expect(picked.map(([key]) => key)).toEqual(['operation', 'minPrice', 'sort', 'view']);
  });

  it('page solo viaja con includePage', () => {
    const params = { operation: 'sale', page: '3' };
    expect(pickSearchReturnParams(params, { includePage: true })).toEqual([
      ['operation', 'sale'],
      ['page', '3'],
    ]);
    expect(pickSearchReturnParams(params, { includePage: false })).toEqual([['operation', 'sale']]);
  });

  it('descarta q, form, zoneQuery y claves desconocidas', () => {
    const picked = pickSearchReturnParams(
      { q: 'piso', form: 'criteria', zoneQuery: 'Madrid', utm_source: 'x', operation: 'sale' },
      { includePage: true }
    );
    expect(picked).toEqual([['operation', 'sale']]);
  });

  it('solo valores escalares: omite arrays y undefined', () => {
    const picked = pickSearchReturnParams(
      { operation: ['sale', 'rent'], minPrice: undefined, sort: 'price' },
      { includePage: true }
    );
    expect(picked).toEqual([['sort', 'price']]);
  });
});

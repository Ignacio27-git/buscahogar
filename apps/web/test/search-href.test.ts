// ROADMAP 2.6 (decisión 118, "Data Flow") — constructores de href puros de la
// búsqueda: vista, zona dibujada, quitar zona y selección de zona.
import { describe, expect, it } from 'vitest';

import {
  buildClearAreaHref,
  buildClearFiltersHref,
  buildCurrentHref,
  buildDrawnAreaHref,
  buildPageHref,
  buildRemoveFilterHref,
  buildViewHref,
  buildZoneSelectionHref,
  canonicalizeFormSubmission,
  pickFilterBarContext,
} from '../src/lib/search-href.js';

const RING = [
  { lat: 40.4, lon: -3.7 },
  { lat: 40.4, lon: -3.6 },
  { lat: 40.5, lon: -3.6 },
] as const;

function parse(href: string): URLSearchParams {
  expect(href.startsWith('/?')).toBe(true);
  return new URLSearchParams(href.slice(2));
}

describe('buildViewHref — SMV-1', () => {
  it('a mapa: view=map, conserva el resto y descarta page', () => {
    const q = parse(buildViewHref({ operation: 'rent', polygon: '1,2;3,4;5,6', page: '3' }, 'map'));
    expect(q.get('view')).toBe('map');
    expect(q.get('operation')).toBe('rent');
    expect(q.get('polygon')).toBe('1,2;3,4;5,6');
    expect(q.has('page')).toBe(false);
  });

  it('a lista: quita view, conserva filtros y descarta page', () => {
    const q = parse(buildViewHref({ operation: 'rent', view: 'map', page: '2' }, 'list'));
    expect(q.has('view')).toBe(false);
    expect(q.get('operation')).toBe('rent');
    expect(q.has('page')).toBe(false);
  });

  it('conserva zone y lat/lng/radius', () => {
    const q = parse(buildViewHref({ zone: '28079', lat: '1', lng: '2', radius: '500' }, 'map'));
    expect([q.get('zone'), q.get('lat'), q.get('lng'), q.get('radius')]).toEqual(['28079', '1', '2', '500']);
  });

  it('claves repetidas se conservan todas', () => {
    const q = parse(buildViewHref({ rooms: ['1', '2'] }, 'map'));
    expect(q.getAll('rooms')).toEqual(['1', '2']);
  });
});

describe('buildDrawnAreaHref — SMV-8', () => {
  it('pone polygon (5 decimales), view=map y descarta page, zone, zoneQuery, lat, lng y radius', () => {
    const q = parse(
      buildDrawnAreaHref(
        { operation: 'sale', page: '4', zone: '28079', zoneQuery: 'mad', lat: '1', lng: '2', radius: '900', view: 'map' },
        RING
      )
    );
    expect(q.get('polygon')).toBe('40.4,-3.7;40.4,-3.6;40.5,-3.6');
    expect(q.get('view')).toBe('map');
    expect(q.get('operation')).toBe('sale');
    for (const key of ['page', 'zone', 'zoneQuery', 'lat', 'lng', 'radius']) {
      expect(q.has(key)).toBe(false);
    }
  });

  it('un polígono nuevo REEMPLAZA al anterior', () => {
    const q = parse(buildDrawnAreaHref({ polygon: '9,9;8,8;7,7', view: 'map' }, RING));
    expect(q.getAll('polygon')).toEqual(['40.4,-3.7;40.4,-3.6;40.5,-3.6']);
  });
});

describe('buildClearAreaHref — SMV-8 "Quitar zona"', () => {
  it('quita polygon y page y conserva el resto', () => {
    const q = parse(buildClearAreaHref({ polygon: '1,2;3,4;5,6', page: '2', view: 'map', operation: 'rent' }));
    expect(q.has('polygon')).toBe(false);
    expect(q.has('page')).toBe(false);
    expect(q.get('view')).toBe('map');
    expect(q.get('operation')).toBe('rent');
  });
});

describe('buildZoneSelectionHref — decisión 118', () => {
  it('pone zone, descarta page y zoneQuery (comportamiento previo)', () => {
    const q = parse(buildZoneSelectionHref({ zoneQuery: 'mad', page: '2', operation: 'rent' }, '28079'));
    expect(q.get('zone')).toBe('28079');
    expect(q.has('zoneQuery')).toBe(false);
    expect(q.has('page')).toBe(false);
    expect(q.get('operation')).toBe('rent');
  });

  it('descarta también polygon (zone y polygon son excluyentes)', () => {
    const q = parse(buildZoneSelectionHref({ polygon: '1,2;3,4;5,6' }, '28079'));
    expect(q.has('polygon')).toBe(false);
    expect(q.get('zone')).toBe('28079');
  });
});

describe('canonicalizeFormSubmission (ROADMAP 3.1, decisión 123)', () => {
  it('con la marca form=criteria quita la marca y los valores en blanco', () => {
    expect(
      canonicalizeFormSubmission({ form: 'criteria', operation: 'rent', minPrice: '', maxPrice: ' ', zone: '' })
    ).toEqual({ operation: 'rent' });
  });

  it('con la marca conserva valores no vacíos, incluidos los repetidos', () => {
    expect(canonicalizeFormSubmission({ form: 'criteria', maxPrice: '900', sort: ['price', ''] })).toEqual({
      maxPrice: '900',
      sort: ['price'],
    });
  });

  it('sin la marca no toca nada: `?minPrice=` sigue llegando vacío para recibir su rechazo nombrado', () => {
    const raw = { minPrice: '', operation: 'rent' };
    expect(canonicalizeFormSubmission(raw)).toBe(raw);
  });

  it('una marca con otro valor no cuenta', () => {
    const raw = { form: 'otra', minPrice: '' };
    expect(canonicalizeFormSubmission(raw)).toBe(raw);
  });

  it('la marca no se arrastra a los href que se construyen después', () => {
    const cleaned = canonicalizeFormSubmission({ form: 'criteria', operation: 'sale', minRooms: '' });
    expect(buildViewHref(cleaned, 'map')).toBe('/?operation=sale&view=map');
  });
});

// D.6a (decisión 151) — quitar un filtro descarta su grupo de claves y `page`,
// y conserva el resto (view, sort, dir, zoneQuery, claves desconocidas).
describe('buildRemoveFilterHref — D.6a "Chip removes only its filter"', () => {
  const BASE = { operation: 'sale', minRooms: '2', sort: 'price', dir: 'asc', page: '2' } as const;

  it('quita solo minRooms y page, y conserva operation, sort y dir', () => {
    const q = parse(buildRemoveFilterHref(BASE, 'minRooms'));
    expect([...q.keys()].sort()).toEqual(['dir', 'operation', 'sort']);
    expect(q.get('operation')).toBe('sale');
  });

  it.each([
    ['operation', { operation: 'rent', propertyType: 'flat' }, ['propertyType']],
    ['propertyType', { operation: 'rent', propertyType: 'flat' }, ['operation']],
    ['minPrice', { minPrice: '1', maxPrice: '2' }, ['maxPrice']],
    ['maxPrice', { minPrice: '1', maxPrice: '2' }, ['minPrice']],
    ['minSurface', { minSurface: '1', maxSurface: '2' }, ['maxSurface']],
    ['maxSurface', { minSurface: '1', maxSurface: '2' }, ['minSurface']],
    ['minBathrooms', { minBathrooms: '1', minRooms: '2' }, ['minRooms']],
    ['zone', { zone: '28079', zoneQuery: 'mad' }, ['zoneQuery']],
    ['polygon', { polygon: '1,2;3,4;5,6', view: 'map' }, ['view']],
  ] as const)('%s: quita su clave y conserva las demás', (filter, params, kept) => {
    const q = parse(buildRemoveFilterHref(params, filter));
    expect([...q.keys()]).toEqual(kept);
  });

  it('el filtro geográfico quita lat, lng y radius a la vez (todo o nada)', () => {
    const q = parse(buildRemoveFilterHref({ lat: '1', lng: '2', radius: '500', operation: 'rent' }, 'geo'));
    expect([...q.keys()]).toEqual(['operation']);
  });

  it('devuelve `/` cuando no queda ningún parámetro', () => {
    expect(buildRemoveFilterHref({ minRooms: '2', page: '3' }, 'minRooms')).toBe('/');
  });

  it('conserva las claves repetidas desconocidas', () => {
    expect(parse(buildRemoveFilterHref({ minRooms: '2', tag: ['a', 'b'] }, 'minRooms')).getAll('tag')).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('buildClearFiltersHref — D.6a "Clear all"', () => {
  it('conserva solo view, sort y dir', () => {
    expect(
      buildClearFiltersHref({
        view: 'map',
        sort: 'price',
        dir: 'asc',
        minRooms: '2',
        zone: '28079',
        zoneQuery: 'mad',
        page: '4',
      })
    ).toBe('/?view=map&sort=price&dir=asc');
  });

  it('devuelve `/` cuando no hay nada que conservar', () => {
    expect(buildClearFiltersHref({ operation: 'sale', page: '2' })).toBe('/');
  });

  // D.14 (N2) — «Quitar los demás filtros» del estado vacío conserva la zona sin aplicar o el
  // polígono, para no deshacer la causa que explica el aviso de cobertura.
  describe('opción `keep`', () => {
    const params = {
      view: 'map',
      sort: 'price',
      dir: 'asc',
      minRooms: '2',
      zone: '28079',
      zoneQuery: 'mad',
      polygon: '40,-3;40,-4;41,-4',
      page: '4',
    };

    it('conserva la zona y su consulta tras view, sort y dir', () => {
      expect(buildClearFiltersHref(params, { keep: ['zone', 'zoneQuery'] })).toBe(
        '/?view=map&sort=price&dir=asc&zone=28079&zoneQuery=mad'
      );
    });

    it('conserva el polígono codificado', () => {
      expect(buildClearFiltersHref({ polygon: params.polygon, minRooms: '2' }, { keep: ['polygon'] })).toBe(
        `/?${new URLSearchParams({ polygon: params.polygon }).toString()}`
      );
    });

    it('ignora una clave que no está en los parámetros y sin opciones sigue igual', () => {
      expect(buildClearFiltersHref({ operation: 'sale' }, { keep: ['polygon'] })).toBe('/');
      expect(buildClearFiltersHref(params, {})).toBe('/?view=map&sort=price&dir=asc');
    });
  });
});

describe('buildPageHref y buildCurrentHref — movidos desde la página, misma salida', () => {
  it('buildPageHref sustituye page y conserva claves repetidas', () => {
    expect(buildPageHref({ operation: 'sale', page: '1', tag: ['a', 'b'] }, 3)).toBe(
      '/?operation=sale&tag=a&tag=b&page=3'
    );
  });

  it('buildCurrentHref conserva todo, incluido page, y omite los indefinidos', () => {
    expect(buildCurrentHref({ operation: 'sale', page: '2', zone: undefined })).toBe('/?operation=sale&page=2');
  });
});

describe('pickFilterBarContext — D.6a "Hidden state kept, page dropped"', () => {
  it('reenvía view y zone, y nunca page', () => {
    const pairs = pickFilterBarContext({ view: 'map', zone: '28079', page: '3', operation: 'sale' });
    expect(pairs).toEqual([
      ['view', 'map'],
      ['zone', '28079'],
    ]);
  });

  it('solo reenvía valores escalares: un valor repetido no se reenvía', () => {
    expect(pickFilterBarContext({ view: ['map', 'map'], zoneQuery: 'mad' })).toEqual([['zoneQuery', 'mad']]);
  });

  it('omite las claves rechazadas', () => {
    expect(pickFilterBarContext({ view: 'map', polygon: '1,2;3,4;5,6', zone: '28079' }, new Set(['polygon']))).toEqual([
      ['view', 'map'],
      ['zone', '28079'],
    ]);
  });

  it('si se rechaza cualquiera de lat, lng o radius se omiten las tres', () => {
    const params = { lat: '1', lng: '2', radius: '500', view: 'map' };
    expect(pickFilterBarContext(params, new Set(['radius']))).toEqual([['view', 'map']]);
    expect(pickFilterBarContext(params)).toEqual([
      ['view', 'map'],
      ['lat', '1'],
      ['lng', '2'],
      ['radius', '500'],
    ]);
  });
});

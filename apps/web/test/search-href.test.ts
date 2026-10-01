// ROADMAP 2.6 (decisión 118, "Data Flow") — constructores de href puros de la
// búsqueda: vista, zona dibujada, quitar zona y selección de zona.
import { describe, expect, it } from 'vitest';

import {
  buildClearAreaHref,
  buildDrawnAreaHref,
  buildViewHref,
  buildZoneSelectionHref,
  canonicalizeFormSubmission,
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

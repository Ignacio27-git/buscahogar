// Paso 1.14 — area-filter.ts: haversineMeters, extractCoordinates,
// isInArea, mapOperation, isEligible (diseño D9/D10). RED inicial: el
// módulo no existe todavía.
import { describe, expect, it } from 'vitest';

import type { AreaQuery } from '@buscahogar/core';

import {
  extractCoordinates,
  haversineMeters,
  isEligible,
  isInArea,
  mapOperation,
} from '../src/sources/kyero/area-filter.js';
import type { KyeroProperty } from '../src/sources/kyero/raw-property.schema.js';

const CENTER = { latitude: 36.5298, longitude: -4.6499 };
const AREA: AreaQuery = { center: CENTER, radiusMeters: 1000, operation: 'sale' };

function baseProperty(overrides: Partial<KyeroProperty> = {}): KyeroProperty {
  return {
    id: '1',
    price: 100000,
    type: 'flat',
    url: 'https://example.test/1',
    ...overrides,
  };
}

describe('haversineMeters — distancia de círculo máximo (D10, R=6 371 008.8 m)', () => {
  it('la distancia de un punto a sí mismo es 0', () => {
    expect(haversineMeters(CENTER, CENTER)).toBe(0);
  });

  it('una separación de un grado de latitud mide aproximadamente 111 km (sanity check del radio terrestre)', () => {
    const oneDegreeNorth = { latitude: CENTER.latitude + 1, longitude: CENTER.longitude };
    const distance = haversineMeters(CENTER, oneDegreeNorth);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });
});

describe('isInArea — límite inclusivo (D10)', () => {
  it('una coordenada exactamente en el centro está dentro del área', () => {
    expect(isInArea(CENTER, AREA)).toBe(true);
  });

  it('una coordenada a exactamente radiusMeters se incluye (<=)', () => {
    // 1000 m de latitud ~= 0.00898 grados (111 320 m/grado).
    const onBoundary = { latitude: CENTER.latitude + 1000 / 111_320, longitude: CENTER.longitude };
    const distance = haversineMeters(CENTER, onBoundary);
    const area: AreaQuery = { ...AREA, radiusMeters: distance };
    expect(isInArea(onBoundary, area)).toBe(true);
  });

  it('una coordenada más allá del radio se excluye (>)', () => {
    const farAway = { latitude: CENTER.latitude + 0.5, longitude: CENTER.longitude };
    expect(isInArea(farAway, AREA)).toBe(false);
  });

  it('sin coordenadas (undefined) siempre está fuera del área', () => {
    expect(isInArea(undefined, AREA)).toBe(false);
  });
});

describe('extractCoordinates — anidado gana sobre plano (G2, diseño D5 "nested wins")', () => {
  it('usa <location><latitude/><longitude/></location> cuando está presente', () => {
    const raw = baseProperty({ location: { latitude: 10, longitude: 20 }, latitude: 99, longitude: 99 });
    expect(extractCoordinates(raw)).toEqual({ latitude: 10, longitude: 20 });
  });

  it('cae a latitude/longitude planos cuando no hay <location>', () => {
    const raw = baseProperty({ latitude: 10, longitude: 20 });
    expect(extractCoordinates(raw)).toEqual({ latitude: 10, longitude: 20 });
  });

  it('devuelve undefined cuando no hay ninguna coordenada en ningún sitio', () => {
    expect(extractCoordinates(baseProperty())).toBeUndefined();
  });

  it('devuelve undefined si solo una de las dos coordenadas está presente (plana)', () => {
    expect(extractCoordinates(baseProperty({ latitude: 10 }))).toBeUndefined();
  });
});

describe('mapOperation — price_freq -> operation (diseño D9)', () => {
  it('"sale" se mapea a sale', () => {
    expect(mapOperation('sale')).toBe('sale');
  });

  it('"month" se mapea a rent', () => {
    expect(mapOperation('month')).toBe('rent');
  });

  it('ausente se mapea a sale por defecto', () => {
    expect(mapOperation(undefined)).toBe('sale');
  });

  it('un valor desconocido se mapea a invalid', () => {
    expect(mapOperation('week')).toBe('invalid');
  });
});

describe('isEligible — moneda/coordenadas/operación/radio combinados (spec, tabla de condiciones)', () => {
  it('elegible: coords dentro del radio, EUR explícito, operación coincide', () => {
    const raw = baseProperty({ location: { latitude: CENTER.latitude, longitude: CENTER.longitude }, currency: 'EUR', price_freq: 'sale' });
    expect(isEligible(raw, AREA)).toBe(true);
  });

  it('elegible: currency ausente se trata como EUR', () => {
    const raw = baseProperty({ location: { latitude: CENTER.latitude, longitude: CENTER.longitude }, price_freq: 'sale' });
    expect(isEligible(raw, AREA)).toBe(true);
  });

  it('excluida: sin coordenadas', () => {
    const raw = baseProperty({ currency: 'EUR', price_freq: 'sale' });
    expect(isEligible(raw, AREA)).toBe(false);
  });

  it('excluida: fuera del radio', () => {
    const raw = baseProperty({
      location: { latitude: CENTER.latitude + 0.5, longitude: CENTER.longitude },
      currency: 'EUR',
      price_freq: 'sale',
    });
    expect(isEligible(raw, AREA)).toBe(false);
  });

  it('excluida: operación distinta a la del área (rent vs sale)', () => {
    const raw = baseProperty({
      location: { latitude: CENTER.latitude, longitude: CENTER.longitude },
      currency: 'EUR',
      price_freq: 'month',
    });
    expect(isEligible(raw, AREA)).toBe(false);
  });

  it('excluida: moneda distinta de EUR (GBP), aunque coords y operación coincidan', () => {
    const raw = baseProperty({
      location: { latitude: CENTER.latitude, longitude: CENTER.longitude },
      currency: 'GBP',
      price_freq: 'sale',
    });
    expect(isEligible(raw, AREA)).toBe(false);
  });

  it('excluida: price_freq desconocido (operación inválida)', () => {
    const raw = baseProperty({
      location: { latitude: CENTER.latitude, longitude: CENTER.longitude },
      currency: 'EUR',
      price_freq: 'week',
    });
    expect(isEligible(raw, AREA)).toBe(false);
  });
});

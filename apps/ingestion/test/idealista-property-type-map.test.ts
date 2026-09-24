// Paso 1.6 — mapa fuente→dominio de propertyType (R-PTYPE). Entradas
// confirmadas por evidencia de fixture (docs/DECISIONS.md 027 y el diseño
// del cambio: 45/50 flat, 4/50 penthouse, 1/50 duplex en homes; 50/50
// premise en premises), más los casos sintéticos que las fixtures no pueden
// cubrir: "chalet" (0 apariciones) y el resto del vocabulario sin sondear
// (offices/garages/bedrooms).
import { describe, expect, it } from 'vitest';

import { describeMapping, mapPropertyType } from '../src/sources/idealista/property-type-map.js';

describe('mapPropertyType — vocabulario confirmado por fixture', () => {
  it.each([
    ['flat', 'flat'],
    ['penthouse', 'penthouse'],
    ['duplex', 'duplex'],
    ['premise', 'commercial'],
  ] as const)('mapea "%s" a "%s"', (raw, expected) => {
    expect(mapPropertyType(raw)).toBe(expected);
  });

  it('mapea el sintético "chalet" a "house" (0 apariciones en las fixtures committeadas)', () => {
    expect(mapPropertyType('chalet')).toBe('house');
  });

  it('degrada cualquier valor no reconocido a "other", nunca lanza (offices/garages/bedrooms sin vocabulario sondeado)', () => {
    expect(mapPropertyType('offices')).toBe('other');
    expect(mapPropertyType('garages')).toBe('other');
    expect(mapPropertyType('bedrooms')).toBe('other');
    expect(mapPropertyType('un-valor-inventado')).toBe('other');
    expect(() => mapPropertyType('cualquier-cosa')).not.toThrow();
  });
});

describe('describeMapping — reporte sin I/O de si un valor fue reconocido', () => {
  it('informa recognised=true y el valor mapeado para un valor del mapa', () => {
    expect(describeMapping('flat')).toEqual({ recognised: true, value: 'flat' });
    expect(describeMapping('premise')).toEqual({ recognised: true, value: 'commercial' });
  });

  it('informa recognised=false y value="other" para un valor no reconocido', () => {
    expect(describeMapping('offices')).toEqual({ recognised: false, value: 'other' });
  });
});

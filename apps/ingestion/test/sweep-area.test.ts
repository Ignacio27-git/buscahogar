// Paso 1.7 — buildArea / areaFingerprint (CLI-1c, D6). La huella de área
// alimenta job-cursor.ts: debe ser estable frente al orden de las claves y
// distinguir cualquier cambio real de centro/radio/operación — un
// `--radius` mal tecleado en una reanudación debe producir una huella
// DISTINTA, nunca reanudar en silencio el barrido de otra área.
import { describe, expect, it } from 'vitest';

import { areaQuerySchema, type AreaQuery } from '@buscahogar/core';

import { areaFingerprint, buildArea } from '../src/sweep/area.js';
import type { SweepOptions } from '../src/sweep/options.js';

function options(overrides: Partial<SweepOptions> = {}): SweepOptions {
  return {
    zone: '18087',
    center: { latitude: 37.18, longitude: -3.6 },
    radiusMeters: 2000,
    operation: 'sale',
    maxSearchRequestsPerSweep: 10,
    ...overrides,
  };
}

describe('buildArea — CLI-1c: construye un AreaQuery bien formado', () => {
  it('produce un AreaQuery que pasa areaQuerySchema', () => {
    const area = buildArea(options());
    expect(() => areaQuerySchema.parse(area)).not.toThrow();
    expect(area).toEqual({ center: { latitude: 37.18, longitude: -3.6 }, radiusMeters: 2000, operation: 'sale' });
  });

  it('no arrastra el campo "zone" — AreaQuery es estricto y lo rechazaría', () => {
    const area = buildArea(options());
    expect(area).not.toHaveProperty('zone');
  });
});

describe('areaFingerprint — D6: estable frente al orden de claves, sensible a cada campo', () => {
  const AREA: AreaQuery = { center: { latitude: 1, longitude: 2 }, radiusMeters: 500, operation: 'sale' };

  it('es idéntica cuando las claves se reordenan', () => {
    const reordered: AreaQuery = {
      radiusMeters: 500,
      operation: 'sale',
      center: { longitude: 2, latitude: 1 },
    };
    expect(areaFingerprint(AREA)).toBe(areaFingerprint(reordered));
  });

  it('difiere cuando cambia el centro', () => {
    const other: AreaQuery = { ...AREA, center: { latitude: 9, longitude: 2 } };
    expect(areaFingerprint(AREA)).not.toBe(areaFingerprint(other));
  });

  it('difiere cuando cambia el radio', () => {
    const other: AreaQuery = { ...AREA, radiusMeters: 999 };
    expect(areaFingerprint(AREA)).not.toBe(areaFingerprint(other));
  });

  it('difiere cuando cambia la operación', () => {
    const other: AreaQuery = { ...AREA, operation: 'rent' };
    expect(areaFingerprint(AREA)).not.toBe(areaFingerprint(other));
  });
});

// ROADMAP 1.13 (diseño DD-9, Q7) + adaptación al fichero real (continuación
// 1.13) — la heurística de esparcimiento entre entidades hermanas
// (ENTIDADES.csv) se reemplaza por la superficie PUBLICADA de cada
// municipio (`SUPERFICIE`, hectáreas, en `MUNICIPIOS.csv`): un radio
// derivado del propio dato, no estimado a partir de una muestra indirecta.
// Fórmula: `radio = sqrt(superficie_m2 / π)` — el radio del círculo cuya
// área coincide con la superficie real del municipio —, acotado por el
// mismo SUELO/TECHO que antes (SUELO: nunca radio 0; TECHO: control de
// cuota, no geográfico).
import { describe, expect, it } from 'vitest';

import { deriveSweepRadiusM, greatCircleMeters, RADIUS_CEILING_M, RADIUS_FLOOR_M } from '../../src/catalogue/geo.js';

describe('greatCircleMeters (DD-9) — delega en haversineDistanceMeters de @buscahogar/core', () => {
  it('devuelve 0 para dos coordenadas idénticas', () => {
    const point = { latitude: 40.4168, longitude: -3.7038 };
    expect(greatCircleMeters(point, point)).toBe(0);
  });

  it('línea base calculada a mano: 0.001° de diferencia en latitud ≈ 111.19 m', () => {
    const a = { latitude: 40.0, longitude: -3.0 };
    const b = { latitude: 40.001, longitude: -3.0 };
    expect(greatCircleMeters(a, b)).toBeCloseTo(111.1949, 3);
  });
});

describe('deriveSweepRadiusM (adaptación real) — clamp(sqrt(superficie_m2 / π), FLOOR, CEILING)', () => {
  it('Granada real (SUPERFICIE=8806,81 ha, MUNICIPIOS.csv) da ≈5295 m, calculado a mano', () => {
    // sqrt(8806.81 * 10000 / π) = 5294.61… → round → 5295.
    expect(deriveSweepRadiusM(8806.81)).toBe(5295);
  });

  it('una superficie que produce un radio por debajo del SUELO se recorta al SUELO, nunca queda por debajo', () => {
    // sqrt(10 * 10000 / π) ≈ 178 m, muy por debajo de RADIUS_FLOOR_M (2000).
    expect(deriveSweepRadiusM(10)).toBe(RADIUS_FLOOR_M);
  });

  it('una superficie muy grande se recorta al TECHO (control de cuota, no geográfico)', () => {
    // sqrt(1_000_000 * 10000 / π) ≈ 178 412 m, muy por encima de RADIUS_CEILING_M (15000).
    expect(deriveSweepRadiusM(1_000_000)).toBe(RADIUS_CEILING_M);
  });

  it('superficie 0, negativa o no finita usa el SUELO — sin dato de área no hay círculo real que derivar, pero nunca 0', () => {
    expect(deriveSweepRadiusM(0)).toBe(RADIUS_FLOOR_M);
    expect(deriveSweepRadiusM(-5)).toBe(RADIUS_FLOOR_M);
    expect(deriveSweepRadiusM(Number.NaN)).toBe(RADIUS_FLOOR_M);
  });

  it('una superficie a media escala entre suelo y techo pasa sin recortar', () => {
    // sqrt(500 * 10000 / π) ≈ 1261 m está por debajo del suelo (2000) —
    // usamos un valor mayor para caer realmente en la banda media.
    const radius = deriveSweepRadiusM(3000); // sqrt(3000*10000/π) ≈ 3090 m
    expect(radius).toBeGreaterThan(RADIUS_FLOOR_M);
    expect(radius).toBeLessThan(RADIUS_CEILING_M);
  });
});

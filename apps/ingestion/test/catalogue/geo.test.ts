// ROADMAP 1.13 (diseño DD-9, Q7) — el radio de barrido de cada municipio se
// deriva del propio esparcimiento de sus entidades hermanas NGMEP (una
// muestra gratuita, en el propio fichero, de dónde vive la población real),
// acotado por un suelo (evita radio 0 con una sola entidad) y un techo (tope
// de cuota: un radio mayor cuesta más páginas por barrido).
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

describe('deriveSweepRadiusM (DD-9) — clamp(max distancia a una hermana, FLOOR, CEILING)', () => {
  const centroid = { latitude: 37.177336, longitude: -3.598557 };

  it('un municipio de una sola entidad (sin hermanas) usa el SUELO, nunca radio 0', () => {
    expect(deriveSweepRadiusM(centroid, [])).toBe(RADIUS_FLOOR_M);
  });

  it('una hermana a media distancia entre suelo y techo pasa sin recortar', () => {
    // ~0.05° de latitud ≈ 5 560 m — entre FLOOR (2000) y CEILING (15000).
    const sibling = { latitude: centroid.latitude + 0.05, longitude: centroid.longitude };
    const radius = deriveSweepRadiusM(centroid, [sibling]);
    expect(radius).toBeGreaterThan(RADIUS_FLOOR_M);
    expect(radius).toBeLessThan(RADIUS_CEILING_M);
    expect(radius).toBeCloseTo(greatCircleMeters(centroid, sibling), 0);
  });

  it('una hermana muy lejana se recorta al TECHO (control de cuota, no geográfico)', () => {
    // ~2° de latitud ≈ 222 000 m — muy por encima del techo.
    const farSibling = { latitude: centroid.latitude + 2, longitude: centroid.longitude };
    expect(deriveSweepRadiusM(centroid, [farSibling])).toBe(RADIUS_CEILING_M);
  });

  it('toma la MÁXIMA distancia entre varias hermanas, no la media ni la mínima', () => {
    const near = { latitude: centroid.latitude + 0.01, longitude: centroid.longitude }; // ~1112 m
    const far = { latitude: centroid.latitude + 0.05, longitude: centroid.longitude }; // ~5560 m
    const radius = deriveSweepRadiusM(centroid, [near, far]);
    expect(radius).toBeCloseTo(greatCircleMeters(centroid, far), 0);
  });
});

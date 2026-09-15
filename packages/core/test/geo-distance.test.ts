import { describe, expect, it } from 'vitest';

import type { Coordinates } from '../src/types/coordinates.js';
import { haversineDistanceMeters } from '../src/geo/distance.js';

// GEO-1: distancia de círculo máximo pura, sin PostGIS ni ORM (ROADMAP 1.9).
//
// No existe una implementación de referencia offline para contrastar el
// resultado (a diferencia de packages/db, aquí no hay PostGIS disponible en
// tests). Las líneas base están calculadas a mano aprovechando un caso
// particular exacto de Haversine: cuando ambos puntos comparten longitud
// (o comparten latitud 0, el caso ecuatorial), la fórmula general se reduce
// a `distancia = R · Δ` en radianes — sin aproximación, porque el término
// `cos(lat) · sin²(Δlon/2)` de la longitud se anula. Con R = 6 371 000 m y
// Δ = 0.001° = 0.001 · π/180 rad, la distancia esperada es
// 6 371 000 · 0.001 · π/180 ≈ 111.19 m.
describe('haversineDistanceMeters', () => {
  it('devuelve 0 m para dos coordenadas idénticas (GEO-1b)', () => {
    const madrid: Coordinates = { latitude: 40.4168, longitude: -3.7038 };

    expect(haversineDistanceMeters(madrid, madrid)).toBe(0);
  });

  it('es simétrica: distance(A, B) === distance(B, A) (GEO-1a)', () => {
    const a: Coordinates = { latitude: 40.4168, longitude: -3.7038 };
    const b: Coordinates = { latitude: 40.4258, longitude: -3.6928 };

    expect(haversineDistanceMeters(a, b)).toBe(haversineDistanceMeters(b, a));
  });

  it('línea base calculada a mano: 0.001° de diferencia solo en latitud ≈ 111.19 m', () => {
    const a: Coordinates = { latitude: 40.0, longitude: -3.0 };
    const b: Coordinates = { latitude: 40.001, longitude: -3.0 };

    // Δlat = 0.001° → 6 371 000 · 0.001 · π/180 ≈ 111.1949 m.
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(111.1949, 3);
  });

  it('línea base calculada a mano: 0.001° de diferencia solo en longitud, en el ecuador ≈ 111.19 m', () => {
    // En el ecuador (latitud 0), un grado de longitud mide lo mismo que un
    // grado de latitud: cos(0) = 1, así que la fórmula reducida se aplica
    // igual que en el caso anterior.
    const a: Coordinates = { latitude: 0, longitude: 0 };
    const b: Coordinates = { latitude: 0, longitude: 0.001 };

    expect(haversineDistanceMeters(a, b)).toBeCloseTo(111.1949, 3);
  });
});

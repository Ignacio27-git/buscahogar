import { describe, expect, it } from 'vitest';

import {
  scoreBathrooms,
  scoreDistance,
  scorePrice,
  scoreRooms,
  scoreSurface,
} from '../src/strategies/rule-based/signals.js';
import { WEIGHTS } from '../src/strategies/rule-based/weights.js';
import type { Coordinates } from '../src/types/coordinates.js';

// RDS-1: cada señal estructurada, su forma de decaída y su comportamiento
// ante ausencia. Los umbrales de decaída (100 m, 10% relativo) están
// razonados en el diseño (D7): separan "el mismo anuncio publicado dos
// veces" (precio y superficie casi idénticos) de "una vivienda vecina
// parecida" (similar, no idéntica) — el bloqueo (ROADMAP 1.8) ya garantizó
// similitud, así que re-codificarla con un decaimiento suave no decide
// nada.
describe('scoreDistance', () => {
  const base: Coordinates = { latitude: 40.4168, longitude: -3.7038 };

  it('vale 1 en distancia 0 (0 / cutoff)', () => {
    const result = scoreDistance(base, base);
    expect(result.value).toBe(1);
    expect(result.weight).toBe(WEIGHTS.distance);
  });

  it('decae linealmente hasta 0 en el punto medio (50 m de 100 m)', () => {
    // 50 m de diferencia solo en latitud ≈ 0.00045° (fórmula reducida:
    // Δlat = 50 / 6 371 000 rad ≈ 0.00045°).
    const a: Coordinates = { latitude: 40.0, longitude: -3.0 };
    const b: Coordinates = { latitude: 40.00045, longitude: -3.0 };

    const result = scoreDistance(a, b);
    expect(result.value).toBeCloseTo(0.5, 1);
  });

  it('vale 0 exactamente en el punto de corte (100 m)', () => {
    const a: Coordinates = { latitude: 40.0, longitude: -3.0 };
    const b: Coordinates = { latitude: 40.0009, longitude: -3.0 }; // ≈100 m

    const result = scoreDistance(a, b);
    expect(result.value).toBeCloseTo(0, 1);
  });

  it('vale 0 (sin negativos) más allá del punto de corte', () => {
    const a: Coordinates = { latitude: 40.0, longitude: -3.0 };
    const b: Coordinates = { latitude: 40.01, longitude: -3.0 }; // ≈1112 m

    expect(scoreDistance(a, b).value).toBe(0);
  });

  it('coordenadas ausentes en cualquiera de los dos lados → marca ausente, peso 0', () => {
    const result = scoreDistance(undefined, base);
    expect(result.weight).toBe(0);
    expect(result.value).toBe(0);
    expect(result.detail).toBeDefined();
  });
});

describe('scorePrice — siempre evaluable, priceCents es obligatorio', () => {
  it('vale 1 con precios idénticos', () => {
    const result = scorePrice(200_000_00, 200_000_00);
    expect(result.value).toBe(1);
    expect(result.weight).toBe(WEIGHTS.price);
  });

  it('decae linealmente hasta 0 en el punto medio (5% de 10%, ratio sobre el máximo)', () => {
    // r = |pa - pb| / max(pa, pb) = 10 000 00 / 200 000 00 = 0.05 exacto.
    const result = scorePrice(190_000_00, 200_000_00);
    expect(result.value).toBeCloseTo(0.5, 5);
  });

  it('vale 0 exactamente en el punto de corte (10% relativo, ratio sobre el máximo)', () => {
    // r = 20 000 00 / 200 000 00 = 0.10 exacto.
    const result = scorePrice(180_000_00, 200_000_00);
    expect(result.value).toBeCloseTo(0, 5);
  });

  it('vale 0 (sin negativos) más allá del punto de corte', () => {
    const result = scorePrice(200_000_00, 400_000_00);
    expect(result.value).toBe(0);
  });
});

describe('scoreSurface', () => {
  it('vale 1 con superficies idénticas', () => {
    const result = scoreSurface(90, 90);
    expect(result.value).toBe(1);
    expect(result.weight).toBe(WEIGHTS.surface);
  });

  it('decae linealmente hasta 0 en el punto medio (5% de 10%, ratio sobre el máximo)', () => {
    // r = |95 - 100| / 100 = 0.05 exacto.
    expect(scoreSurface(95, 100).value).toBeCloseTo(0.5, 5);
  });

  it('vale 0 exactamente en el punto de corte (10% relativo, ratio sobre el máximo)', () => {
    // r = |90 - 100| / 100 = 0.10 exacto.
    expect(scoreSurface(90, 100).value).toBeCloseTo(0, 5);
  });

  it('vale 0 (sin negativos) más allá del punto de corte', () => {
    expect(scoreSurface(100, 200).value).toBe(0);
  });

  it('superficie ausente en cualquiera de los dos lados → marca ausente, peso 0, nunca valor 0 a peso positivo', () => {
    const result = scoreSurface(undefined, 90);
    expect(result.weight).toBe(0);
    expect(result.detail).toBeDefined();
  });
});

describe('scoreRooms — binario, deliberadamente sin graduar', () => {
  it('vale 1 si coinciden', () => {
    const result = scoreRooms(3, 3);
    expect(result.value).toBe(1);
    expect(result.weight).toBe(WEIGHTS.rooms);
  });

  it('vale 0 si no coinciden, con cualquier margen', () => {
    expect(scoreRooms(3, 4).value).toBe(0);
  });

  it('ausente en cualquiera de los dos lados → marca ausente, peso 0', () => {
    const result = scoreRooms(undefined, 3);
    expect(result.weight).toBe(0);
    expect(result.detail).toBeDefined();
  });
});

describe('scoreBathrooms — binario, deliberadamente sin graduar', () => {
  it('vale 1 si coinciden', () => {
    const result = scoreBathrooms(2, 2);
    expect(result.value).toBe(1);
    expect(result.weight).toBe(WEIGHTS.bathrooms);
  });

  it('vale 0 si no coinciden', () => {
    expect(scoreBathrooms(2, 1).value).toBe(0);
  });

  it('ausente en cualquiera de los dos lados → marca ausente, peso 0', () => {
    const result = scoreBathrooms(2, undefined);
    expect(result.weight).toBe(0);
    expect(result.detail).toBeDefined();
  });
});

describe('simetría por señal', () => {
  it('scorePrice es simétrico', () => {
    expect(scorePrice(200_000_00, 210_000_00)).toEqual(scorePrice(210_000_00, 200_000_00));
  });

  it('scoreDistance es simétrico', () => {
    const a: Coordinates = { latitude: 40.0, longitude: -3.0 };
    const b: Coordinates = { latitude: 40.001, longitude: -3.001 };
    expect(scoreDistance(a, b)).toEqual(scoreDistance(b, a));
  });
});

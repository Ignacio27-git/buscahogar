import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADDRESS_LEVELS,
  BATHROOMS_LEVELS,
  DISTANCE_LEVELS,
  PRICE_LEVELS,
  PRIOR_LAMBDA,
  PRIOR_LOG_ODDS,
  ROOMS_LEVELS,
  SURFACE_LEVELS,
} from '../src/strategies/probabilistic/parameters.js';
import { probabilisticDedupStrategy } from '../src/strategies/probabilistic/strategy.js';
import { ruleBasedDedupStrategy } from '../src/strategies/rule-based/strategy.js';
import { dedupCorpus } from '../src/evaluation/dedup-corpus.js';
import type { Coordinates } from '../src/types/coordinates.js';
import { makeListing } from './test-helpers.js';

const MADRID_CENTER: Coordinates = { latitude: 40.4168, longitude: -3.7038 };
// ≈5 m al norte de MADRID_CENTER (misma fórmula reducida de Haversine que
// dedup-corpus.ts: Δlat_rad = metros / R_tierra).
const NEARBY: Coordinates = { latitude: 40.416845, longitude: -3.7038 };

// Convierte un score FS de vuelta a M (inversa de score = 1/(1+2^-M)):
// M = log2(score / (1 - score)). Solo válida para 0 < score < 1 — suficiente
// para los pares sintéticos de este bloque, que nunca tocan los extremos.
function scoreToM(score: number): number {
  return Math.log2(score / (1 - score));
}

// ROADMAP 2.2, decisión 085: m/u fijados A PRIORI (literatura/razonamiento),
// NUNCA ajustados desde el corpus etiquetado. Verificación literal del
// requisito "No corpus-fitting path exists" (spec): el módulo se INSPECCIONA
// como texto fuente, no solo se ejecuta — un import indirecto que pasara
// desapercibido en tiempo de ejecución (p. ej. un valor reexportado) seguiría
// detectándose aquí.
describe('parameters.ts — parámetros FS fijados a priori, sin dependencia del corpus (decisión 085)', () => {
  it('el módulo de parámetros NO importa ni menciona el corpus etiquetado', () => {
    const parametersPath = fileURLToPath(new URL('../src/strategies/probabilistic/parameters.ts', import.meta.url));
    const source = readFileSync(parametersPath, 'utf-8');
    expect(source).not.toMatch(/dedup-corpus/);
  });
});

describe('parameters.ts — m y u suman 1 por campo, todo valor en (0,1)', () => {
  const fieldTables: ReadonlyArray<readonly [string, Readonly<Record<string, { readonly m: number; readonly u: number }>>]> = [
    ['distance', DISTANCE_LEVELS],
    ['price', PRICE_LEVELS],
    ['surface', SURFACE_LEVELS],
    ['address', ADDRESS_LEVELS],
    ['rooms', ROOMS_LEVELS],
    ['bathrooms', BATHROOMS_LEVELS],
  ];

  it.each(fieldTables)('%s: Σm ≈ 1 y Σu ≈ 1 sobre sus niveles', (_fieldName, levels) => {
    const values = Object.values(levels);
    const sumM = values.reduce((sum, level) => sum + level.m, 0);
    const sumU = values.reduce((sum, level) => sum + level.u, 0);
    expect(sumM).toBeCloseTo(1, 10);
    expect(sumU).toBeCloseTo(1, 10);
  });

  it.each(fieldTables)('%s: todo m y u está estrictamente en (0,1), nunca 0 ni 1', (_fieldName, levels) => {
    for (const level of Object.values(levels)) {
      expect(level.m).toBeGreaterThan(0);
      expect(level.m).toBeLessThan(1);
      expect(level.u).toBeGreaterThan(0);
      expect(level.u).toBeLessThan(1);
    }
  });
});

describe('parameters.ts — prior de coincidencia λ=0.10 (decisión 085)', () => {
  it('PRIOR_LAMBDA está en (0,1) y PRIOR_LOG_ODDS es exactamente su log-odds en base 2 (≈ -3.17)', () => {
    expect(PRIOR_LAMBDA).toBeGreaterThan(0);
    expect(PRIOR_LAMBDA).toBeLessThan(1);
    expect(PRIOR_LOG_ODDS).toBeCloseTo(-3.1699, 3);
  });
});

describe('probabilisticDedupStrategy.score — acotado y determinista', () => {
  it('score está en [0,1] y es determinista: dos llamadas al mismo par devuelven el mismo valor', () => {
    const a = makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      coordinates: NEARBY,
      priceCents: 196_000_00,
      surfaceM2: 88,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const first = probabilisticDedupStrategy.score(a, b);
    const second = probabilisticDedupStrategy.score(a, b);

    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(1);
    expect(first.score).toBe(second.score);
  });

  it('SIM-1a: score está en [0,1] y es simétrico para todo el corpus etiquetado', () => {
    for (const entry of dedupCorpus) {
      const forward = probabilisticDedupStrategy.score(entry.a, entry.b);
      const backward = probabilisticDedupStrategy.score(entry.b, entry.a);

      expect(forward.score).toBeGreaterThanOrEqual(0);
      expect(forward.score).toBeLessThanOrEqual(1);
      expect(forward.score).toBe(backward.score);
    }
  });
});

describe('probabilisticDedupStrategy.score — campo ausente excluido, no penalizado (decisión 086, MAR-exclude)', () => {
  it('coordenadas ausentes en un lado: distance queda a value 0 / weight 0, y M cambia EXACTAMENTE por los bits de distance (no se sustituye por desacuerdo)', () => {
    const a = makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const bWithCoordinates = makeListing({
      coordinates: NEARBY,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const bWithoutCoordinates = makeListing({
      coordinates: undefined,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const withDistance = probabilisticDedupStrategy.score(a, bWithCoordinates);
    const withoutDistance = probabilisticDedupStrategy.score(a, bWithoutCoordinates);

    expect(withoutDistance.signals['distance']?.weight).toBe(0);
    expect(withoutDistance.signals['distance']?.value).toBe(0);

    const distanceBitsWhenPresent = withDistance.signals['distance']?.value ?? 0;
    const mDelta = scoreToM(withDistance.score) - scoreToM(withoutDistance.score);
    expect(mDelta).toBeCloseTo(distanceBitsWhenPresent, 6);
  });
});

// Requirement "Contract Parity and Per-Field Breakdown" (spec): name/version
// distintos de rule-based (decisión 028), y un SignalScore por campo
// comparado, cada uno con `value`/`weight` fijados.
describe('probabilisticDedupStrategy — paridad de contrato con rule-based', () => {
  it('name es distinto del de ruleBasedDedupStrategy; ambos exponen una version no vacía', () => {
    expect(probabilisticDedupStrategy.name).not.toBe(ruleBasedDedupStrategy.name);
    expect(probabilisticDedupStrategy.name).toBe('probabilistic-fellegi-sunter');
    expect(probabilisticDedupStrategy.version.length).toBeGreaterThan(0);
  });

  it('el desglose (signals) contiene una entrada por cada campo comparado, cada una con value y weight numéricos', () => {
    const a = makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });
    const b = makeListing({
      coordinates: NEARBY,
      priceCents: 196_000_00,
      surfaceM2: 88,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    });

    const result = probabilisticDedupStrategy.score(a, b);
    const expectedKeys = ['prior', 'distance', 'price', 'surface', 'address', 'rooms', 'bathrooms', 'propertyTypeMatch', 'operationMatch'];

    for (const key of expectedKeys) {
      const signal = result.signals[key];
      expect(signal).toBeDefined();
      expect(typeof signal?.value).toBe('number');
      expect(typeof signal?.weight).toBe('number');
    }
  });
});

// Decisión 085: score = 1/(1+2^-M), forma estable de 2^M/(1+2^M). Se
// reconstruye M SUMANDO el propio desglose devuelto (nunca recalculando M de
// forma independiente) — así la prueba encadena la fórmula documentada con
// el dato real que `score()` reportó, comparado con toBeCloseTo (nunca
// igualdad estricta, por el redondeo de punto flotante en Math.pow/log2).
describe('probabilisticDedupStrategy.score — coincide con 1/(1+2^-M) reconstruido desde el propio desglose', () => {
  it.each(dedupCorpus.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const result = probabilisticDedupStrategy.score(entry.a, entry.b);
    const { prior, distance, price, surface, address, rooms, bathrooms } = result.signals;
    const m =
      (prior?.value ?? 0) +
      (distance?.value ?? 0) +
      (price?.value ?? 0) +
      (surface?.value ?? 0) +
      (address?.value ?? 0) +
      (rooms?.value ?? 0) +
      (bathrooms?.value ?? 0);
    const expectedScore = 1 / (1 + Math.pow(2, -m));

    expect(result.score).toBeCloseTo(expectedScore, 10);
  });
});

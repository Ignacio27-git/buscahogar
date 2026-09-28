// ROADMAP 2.3 — computeCalibration / runCalibrateThreshold (decisión 097):
// T = min(10, dNegMin-2) sobre el conjunto de calibración (6 bases, 48
// positivos, 15 negativos cruzados) — nunca sobre el corpus de evaluación
// (spec "Threshold T Traceable Only to the Calibration Set"). Aborta sin
// escribir nada si T<1 (spec "Calibration Aborts on a Degenerate
// Threshold").
import { describe, expect, it } from 'vitest';

import { hammingDistance64, type ImageHashEntry } from '@buscahogar/core';

import {
  CalibrationAbortError,
  calibrationRefOriginal,
  calibrationRefTransform,
  computeCalibration,
} from '../src/image-hash/calibration.js';
import { IMAGE_HASH_ALGORITHM } from '../src/image-hash/hash-table.schema.js';
import { IMAGE_TRANSFORM_KINDS } from '../src/image-hash/transforms.js';
import { runCalibrateThreshold, type CalibrateIo } from '../scripts/calibrate-image-threshold.js';

const BASES = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'] as const;

// popcount(hexWithBits(n)) === n — construye un hash de 64 bits con
// exactamente los `n` bits menos significativos a 1; distancia(0, hash) ===
// n bajo hammingDistance64 (ya testeado por separado en image-hamming.test.ts,
// usado aquí solo como bloque de construcción determinista).
function hexWithBits(n: number): string {
  let value = 0n;
  for (let bit = 0; bit < n; bit += 1) {
    value |= 1n << BigInt(bit);
  }
  return value.toString(16).padStart(16, '0');
}

// Bloque DISJUNTO de 6 bits para la base `index` (bits [6*index, 6*index+5])
// — dos bloques de bases distintas nunca se solapan, así que su XOR es la
// UNIÓN de ambos: popcount 6+6=12 exactamente, sin excepción.
function disjointBlock(index: number): string {
  let value = 0n;
  for (let bit = 0; bit < 6; bit += 1) {
    value |= 1n << BigInt(6 * index + bit);
  }
  return value.toString(16).padStart(16, '0');
}

function hashed(hash: string): ImageHashEntry {
  return { kind: 'hashed', hash, lowEntropy: false };
}

function buildEntries(
  portalAOf: (baseIndex: number) => string,
  extra?: (baseId: string, baseIndex: number, entries: Record<string, ImageHashEntry>) => void
): Record<string, ImageHashEntry> {
  const entries: Record<string, ImageHashEntry> = {};
  BASES.forEach((baseId, index) => {
    entries[calibrationRefOriginal(baseId)] = hashed(hexWithBits(0));
    entries[calibrationRefTransform(baseId, 'rescale')] = hashed(hexWithBits(0));
    entries[calibrationRefTransform(baseId, 'jpeg')] = hashed(hexWithBits(3));
    entries[calibrationRefTransform(baseId, 'webp')] = hashed(hexWithBits(10));
    entries[calibrationRefTransform(baseId, 'crop')] = hashed(hexWithBits(11));
    entries[calibrationRefTransform(baseId, 'overlay')] = hashed(hexWithBits(20));
    const portalA = portalAOf(index);
    entries[calibrationRefTransform(baseId, 'portalA')] = hashed(portalA);
    entries[calibrationRefTransform(baseId, 'portalB')] = hashed(portalA); // == portalA salvo que `extra` lo sobrescriba
    extra?.(baseId, index, entries);
  });
  return entries;
}

describe('computeCalibration (ROADMAP 2.3, decisión 097)', () => {
  it('produce exactamente 48 positivos (6 bases x 8) y 15 negativos (C(6,2))', () => {
    const entries = buildEntries((index) => disjointBlock(index));

    const report = computeCalibration(entries, [...BASES]);

    expect(report.positives).toHaveLength(48);
    expect(report.negatives).toHaveLength(15);
  });

  it('T = min(10, dNegMin-2), clamped a 10 cuando dNegMin-2 lo supera (bloques disjuntos de 6 bits: dNegMin=12)', () => {
    const entries = buildEntries((index) => disjointBlock(index));

    const report = computeCalibration(entries, [...BASES]);

    expect(report.dNegMin).toBe(12);
    expect(report.threshold).toBe(10);
  });

  it('recall de positivos en T: cuenta exactamente las distancias <= threshold (36/48 = 0.75 con esta construcción)', () => {
    const entries = buildEntries((index) => disjointBlock(index));

    const report = computeCalibration(entries, [...BASES]);

    // Por base: rescale(0), jpeg(3), webp(10), portalA(6), portalB(6),
    // portalA-vs-portalB(0) <= 10 (6 contadas); crop(11), overlay(20) > 10
    // (2 no contadas) — 6/8 por base, 36/48 en total.
    expect(report.positiveRecallAtThreshold).toBeCloseTo(0.75, 10);
  });

  it('dNegMin real: coincide con el mínimo obtenido recorriendo las 15 parejas con hammingDistance64 como oráculo independiente', () => {
    // Distancias arbitrarias (no la construcción "limpia" de disjointBlock) —
    // comprueba que computeCalibration enumera las 15 parejas correctamente,
    // no solo que reproduce el caso feliz de bloques disjuntos.
    const bits = [0, 3, 7, 12, 20, 35];
    const portalAHashes = bits.map((n) => hexWithBits(n));
    const entries = buildEntries((index) => portalAHashes[index] ?? hexWithBits(0));

    const report = computeCalibration(entries, [...BASES]);

    let expectedDNegMin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < portalAHashes.length; i += 1) {
      for (let j = i + 1; j < portalAHashes.length; j += 1) {
        const a = portalAHashes[i] as string;
        const b = portalAHashes[j] as string;
        expectedDNegMin = Math.min(expectedDNegMin, hammingDistance64(a, b));
      }
    }

    expect(report.dNegMin).toBe(expectedDNegMin);
    expect(report.threshold).toBe(Math.min(10, expectedDNegMin - 2));
  });

  it('aborta con CalibrationAbortError cuando T calculado < 1 (dNegMin=2, sintético)', () => {
    // b0 y b1 difieren en solo 2 bits (bit 5 <-> bit 6); el resto de bases
    // mantiene bloques disjuntos lejanos, así que dNegMin real = 2.
    const entries = buildEntries((index) => {
      if (index === 0) return disjointBlock(0); // bits 0..5
      if (index === 1) {
        // bits 0..4 y 6 (en vez de 0..5): XOR con disjointBlock(0) = {bit5,bit6} = popcount 2.
        let value = 0n;
        for (let bit = 0; bit < 5; bit += 1) value |= 1n << BigInt(bit);
        value |= 1n << 6n;
        return value.toString(16).padStart(16, '0');
      }
      return disjointBlock(index);
    });

    expect(() => computeCalibration(entries, [...BASES])).toThrow(CalibrationAbortError);

    try {
      computeCalibration(entries, [...BASES]);
      expect.unreachable('computeCalibration debía lanzar CalibrationAbortError');
    } catch (error) {
      expect(error).toBeInstanceOf(CalibrationAbortError);
      const abortError = error as CalibrationAbortError;
      expect(abortError.dNegMin).toBe(2);
      expect(abortError.attemptedThreshold).toBe(0);
    }
  });

  it('lanza RangeError si falta una entrada de hash requerida (referencia mal construida)', () => {
    const entries = buildEntries((index) => disjointBlock(index));
    // Reflect.deleteProperty en vez de `delete entries[...]`: el ESLint
    // compartido del monorepo prohíbe borrar una clave computada
    // dinámicamente (@typescript-eslint/no-dynamic-delete).
    Reflect.deleteProperty(entries, calibrationRefOriginal('b0'));

    expect(() => computeCalibration(entries, [...BASES])).toThrow(RangeError);
  });
});

describe('runCalibrateThreshold — CLI (ROADMAP 2.3, decisión 097)', () => {
  function sortedEntries(entries: Record<string, ImageHashEntry>): Record<string, ImageHashEntry> {
    const sorted: Record<string, ImageHashEntry> = {};
    for (const key of Object.keys(entries).sort()) {
      sorted[key] = entries[key] as ImageHashEntry;
    }
    return sorted;
  }

  function hashTableJson(entries: Record<string, ImageHashEntry>): string {
    return JSON.stringify({
      sharp: '0.34.2',
      libvips: '8.16.1',
      algorithm: IMAGE_HASH_ALGORITHM,
      cropMargin: 0.05,
      lowEntropyStddev: 10,
      entries: sortedEntries(entries),
    });
  }

  function fakeIo(): CalibrateIo & { readonly writes: Array<{ path: string; text: string }>; readonly logs: string[] } {
    const writes: Array<{ path: string; text: string }> = [];
    const logs: string[] = [];
    return {
      writes,
      logs,
      log: (line: string): void => {
        logs.push(line);
      },
      writeFile: (path: string, text: string): void => {
        writes.push({ path, text });
      },
    };
  }

  it('caso feliz: exit 0 y escribe exactamente un calibration-report.json con T y dNegMin', () => {
    const entries = buildEntries((index) => disjointBlock(index));
    const io = fakeIo();

    const exitCode = runCalibrateThreshold(hashTableJson(entries), [...BASES], io);

    expect(exitCode).toBe(0);
    expect(io.writes).toHaveLength(1);
    expect(io.writes[0]?.path.endsWith('calibration-report.json')).toBe(true);
    const written = JSON.parse(io.writes[0]?.text ?? '{}') as { threshold: number; dNegMin: number };
    expect(written.threshold).toBe(10);
    expect(written.dNegMin).toBe(12);
  });

  it('caso de aborto (T<1): exit 1, NO escribe calibration-report.json, registra el error', () => {
    const entries = buildEntries((index) => {
      if (index === 0) return disjointBlock(0);
      if (index === 1) {
        let value = 0n;
        for (let bit = 0; bit < 5; bit += 1) value |= 1n << BigInt(bit);
        value |= 1n << 6n;
        return value.toString(16).padStart(16, '0');
      }
      return disjointBlock(index);
    });
    const io = fakeIo();

    const exitCode = runCalibrateThreshold(hashTableJson(entries), [...BASES], io);

    expect(exitCode).toBe(1);
    expect(io.writes).toHaveLength(0);
    expect(io.logs.some((line) => line.includes('Calibración abortada'))).toBe(true);
  });

  it.each(IMAGE_TRANSFORM_KINDS)(
    'calibrationRefTransform expone el mismo esquema de claves que generate-image-hashes: fixture-image:calib/<base>-%s',
    (kind) => {
      expect(calibrationRefTransform('calib-facade-1', kind)).toBe(`fixture-image:calib/calib-facade-1-${kind}`);
    }
  );
});

// computeCalibration (ROADMAP 2.3, decisión 097): calcula el umbral T de la
// señal de imagen a partir ÚNICAMENTE del conjunto de calibración — 6 bases,
// nunca las 24 parejas del corpus de evaluación (spec "Threshold T
// Traceable Only to the Calibration Set"). Pura: opera sobre un mapa de
// entradas de hash YA CARGADO (hashes.calibration.json) y una lista de base
// ids, cero I/O — el I/O real vive en scripts/calibrate-image-threshold.ts.
//
// Positivos (48 = 6 bases x 8): original vs cada uno de los 7 transforms de
// transforms.ts, más portalA vs portalB, por cada base — la misma foto,
// degradada de 8 formas distintas.
// Negativos (15 = C(6,2)): portalA(baseX) vs portalA(baseY) para cada
// pareja de bases DISTINTAS — el mismo "portal" (chrome idéntico) sobre
// fachadas de EDIFICIOS distintos, la peor confusión posible para pHash.
//
// Regla FIJADA antes de correr (decisión 097, nunca ajustada después de ver
// resultados): T = min(10, dNegMin - 2). Si T < 1, la calibración ABORTA
// (spec "Calibration Aborts on a Degenerate Threshold"): un T degenerado
// nunca se usa ni se persiste.
import { hammingDistance64, type ImageHashEntry } from '@buscahogar/core';

import { IMAGE_TRANSFORM_KINDS, type ImageTransformKind } from './transforms.js';

// Mismo esquema de claves que scripts/generate-image-hashes.ts —
// exportado desde aquí para que ambos ficheros compartan una única fuente
// de verdad y nunca se desincronicen.
export function calibrationRefOriginal(baseId: string): string {
  return `fixture-image:calib/${baseId}-original`;
}

export function calibrationRefTransform(baseId: string, kind: ImageTransformKind): string {
  return `fixture-image:calib/${baseId}-${kind}`;
}

const MAX_THRESHOLD = 10;
const NEGATIVE_MARGIN = 2;
const MIN_VALID_THRESHOLD = 1;

export class CalibrationAbortError extends Error {
  public readonly dNegMin: number;
  public readonly attemptedThreshold: number;

  constructor(dNegMin: number, attemptedThreshold: number) {
    super(
      `Calibración abortada: T = min(${String(MAX_THRESHOLD)}, dNegMin-${String(NEGATIVE_MARGIN)}) = ${String(attemptedThreshold)} < ${String(MIN_VALID_THRESHOLD)} (dNegMin=${String(dNegMin)}). No se escribe calibration-report.json ni se emite ningún umbral.`
    );
    this.name = 'CalibrationAbortError';
    this.dNegMin = dNegMin;
    this.attemptedThreshold = attemptedThreshold;
  }
}

export interface CalibrationPairDistance {
  readonly label: string;
  readonly distance: number;
}

export interface CalibrationHistogramBucket {
  readonly distance: number;
  readonly count: number;
}

export interface CalibrationReport {
  readonly positives: readonly CalibrationPairDistance[];
  readonly negatives: readonly CalibrationPairDistance[];
  readonly positiveHistogram: readonly CalibrationHistogramBucket[];
  readonly negativeHistogram: readonly CalibrationHistogramBucket[];
  readonly dNegMin: number;
  readonly threshold: number;
  readonly positiveRecallAtThreshold: number;
}

function hashOf(entries: Readonly<Record<string, ImageHashEntry>>, ref: string): string {
  const entry = entries[ref];
  if (entry === undefined || entry.kind !== 'hashed') {
    throw new RangeError(
      `computeCalibration: falta una entrada de hash legible para la referencia "${ref}" — el conjunto de calibración debe cubrir el original y los 7 transforms de las 6 bases.`
    );
  }
  return entry.hash;
}

function histogramOf(distances: readonly number[]): readonly CalibrationHistogramBucket[] {
  const counts = new Map<number, number>();
  for (const distance of distances) {
    counts.set(distance, (counts.get(distance) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([distance, count]) => ({ distance, count }));
}

function buildPositives(
  entries: Readonly<Record<string, ImageHashEntry>>,
  bases: readonly string[]
): CalibrationPairDistance[] {
  const positives: CalibrationPairDistance[] = [];
  for (const baseId of bases) {
    const original = hashOf(entries, calibrationRefOriginal(baseId));
    for (const kind of IMAGE_TRANSFORM_KINDS) {
      const transformed = hashOf(entries, calibrationRefTransform(baseId, kind));
      positives.push({
        label: `${baseId}:original-vs-${kind}`,
        distance: hammingDistance64(original, transformed),
      });
    }
    const portalA = hashOf(entries, calibrationRefTransform(baseId, 'portalA'));
    const portalB = hashOf(entries, calibrationRefTransform(baseId, 'portalB'));
    positives.push({ label: `${baseId}:portalA-vs-portalB`, distance: hammingDistance64(portalA, portalB) });
  }
  return positives;
}

function buildNegatives(
  entries: Readonly<Record<string, ImageHashEntry>>,
  bases: readonly string[]
): CalibrationPairDistance[] {
  const negatives: CalibrationPairDistance[] = [];
  for (let i = 0; i < bases.length; i += 1) {
    for (let j = i + 1; j < bases.length; j += 1) {
      const baseX = bases[i] as string;
      const baseY = bases[j] as string;
      const portalAX = hashOf(entries, calibrationRefTransform(baseX, 'portalA'));
      const portalAY = hashOf(entries, calibrationRefTransform(baseY, 'portalA'));
      negatives.push({
        label: `${baseX}:portalA-vs-${baseY}:portalA`,
        distance: hammingDistance64(portalAX, portalAY),
      });
    }
  }
  return negatives;
}

export function computeCalibration(
  entries: Readonly<Record<string, ImageHashEntry>>,
  bases: readonly string[]
): CalibrationReport {
  const positives = buildPositives(entries, bases);
  const negatives = buildNegatives(entries, bases);

  const dNegMin = Math.min(...negatives.map((entry) => entry.distance));
  const threshold = Math.min(MAX_THRESHOLD, dNegMin - NEGATIVE_MARGIN);

  if (threshold < MIN_VALID_THRESHOLD) {
    throw new CalibrationAbortError(dNegMin, threshold);
  }

  const withinThreshold = positives.filter((entry) => entry.distance <= threshold).length;

  return {
    positives,
    negatives,
    positiveHistogram: histogramOf(positives.map((entry) => entry.distance)),
    negativeHistogram: histogramOf(negatives.map((entry) => entry.distance)),
    dNegMin,
    threshold,
    positiveRecallAtThreshold: withinThreshold / positives.length,
  };
}

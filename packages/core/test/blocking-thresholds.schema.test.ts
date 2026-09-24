import { describe, expect, it } from 'vitest';

import type { BlockingThresholds } from '../src/schemas/blocking-thresholds.schema.js';
import { blockingThresholdsSchema } from '../src/schemas/blocking-thresholds.schema.js';
import { withoutField } from './test-helpers.js';

const validPayload = {
  radiusMeters: 300,
  priceBandCents: 2_500_000,
  surfaceToleranceM2: 10,
};

describe('blockingThresholdsSchema — umbral completo y válido (BT-1a)', () => {
  it('acepta { radiusMeters, priceBandCents, surfaceToleranceM2 } y produce un valor usable', () => {
    const result = blockingThresholdsSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      const thresholds: BlockingThresholds = result.data;
      expect(thresholds.radiusMeters).toBe(300);
      expect(thresholds.priceBandCents).toBe(2_500_000);
      expect(thresholds.surfaceToleranceM2).toBe(10);
    }
  });
});

describe('blockingThresholdsSchema — clave no modelada (BT-1b)', () => {
  it('rechaza una clave extra nombrándola, en vez de ignorarla en silencio', () => {
    const result = blockingThresholdsSchema.safeParse({ ...validPayload, radiusUnit: 'm' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const unrecognized = result.error.issues.find((issue) => issue.code === 'unrecognized_keys');
      expect(unrecognized).toBeDefined();
      expect(unrecognized?.keys).toContain('radiusUnit');
    }
  });
});

describe('blockingThresholdsSchema — campo requerido ausente (BT-1c)', () => {
  it('rechaza sin surfaceToleranceM2, nombrándolo, sin sustituir un margen por defecto', () => {
    const result = blockingThresholdsSchema.safeParse(withoutField(validPayload, 'surfaceToleranceM2'));
    expect(result.success).toBe(false);
    if (!result.success) {
      const missing = result.error.issues.find((issue) => issue.path[0] === 'surfaceToleranceM2');
      expect(missing).toBeDefined();
    }
  });
});

describe('blockingThresholdsSchema — radiusMeters positivo, priceBand/surfaceTolerance no negativos', () => {
  it('rechaza radiusMeters: 0 — el radio debe ser estrictamente positivo', () => {
    expect(blockingThresholdsSchema.safeParse({ ...validPayload, radiusMeters: 0 }).success).toBe(false);
  });

  it('rechaza priceBandCents negativo', () => {
    expect(blockingThresholdsSchema.safeParse({ ...validPayload, priceBandCents: -1 }).success).toBe(false);
  });

  it('acepta priceBandCents: 0 — banda de precio cero es válida (solo pares de precio idéntico)', () => {
    expect(blockingThresholdsSchema.safeParse({ ...validPayload, priceBandCents: 0 }).success).toBe(true);
  });

  it('rechaza surfaceToleranceM2 negativo', () => {
    expect(blockingThresholdsSchema.safeParse({ ...validPayload, surfaceToleranceM2: -1 }).success).toBe(false);
  });
});

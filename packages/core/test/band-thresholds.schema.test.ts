import { describe, expect, it } from 'vitest';

import type { BandThresholds } from '../src/schemas/band-thresholds.schema.js';
import { bandThresholdsSchema } from '../src/schemas/band-thresholds.schema.js';
import { withoutField } from './test-helpers.js';

const validPayload = { high: 0.82, low: 0.45 };

describe('bandThresholdsSchema — par válido de umbrales de banda', () => {
  it('acepta { high, low } con low < high en [0,1] y produce un valor usable', () => {
    const result = bandThresholdsSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      const thresholds: BandThresholds = result.data;
      expect(thresholds.high).toBe(0.82);
      expect(thresholds.low).toBe(0.45);
    }
  });

  it('acepta los umbrales por defecto de la estrategia probabilística (0.95/0.50)', () => {
    expect(bandThresholdsSchema.safeParse({ high: 0.95, low: 0.5 }).success).toBe(true);
  });
});

describe('bandThresholdsSchema — low debe ser estrictamente menor que high', () => {
  it('rechaza low === high', () => {
    const result = bandThresholdsSchema.safeParse({ high: 0.5, low: 0.5 });
    expect(result.success).toBe(false);
  });

  it('rechaza low > high', () => {
    const result = bandThresholdsSchema.safeParse({ high: 0.5, low: 0.6 });
    expect(result.success).toBe(false);
  });
});

describe('bandThresholdsSchema — clave no modelada', () => {
  it('rechaza una clave extra en vez de ignorarla en silencio', () => {
    const result = bandThresholdsSchema.safeParse({ ...validPayload, extra: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const unrecognized = result.error.issues.find((issue) => issue.code === 'unrecognized_keys');
      expect(unrecognized).toBeDefined();
      expect(unrecognized?.keys).toContain('extra');
    }
  });
});

describe('bandThresholdsSchema — campo requerido ausente', () => {
  it('rechaza sin low, nombrándolo, sin sustituir un valor por defecto', () => {
    const result = bandThresholdsSchema.safeParse(withoutField(validPayload, 'low'));
    expect(result.success).toBe(false);
    if (!result.success) {
      const missing = result.error.issues.find((issue) => issue.path[0] === 'low');
      expect(missing).toBeDefined();
    }
  });
});

describe('bandThresholdsSchema — high y low acotados a [0,1]', () => {
  it('rechaza high > 1', () => {
    expect(bandThresholdsSchema.safeParse({ high: 1.1, low: 0.5 }).success).toBe(false);
  });

  it('rechaza low < 0', () => {
    expect(bandThresholdsSchema.safeParse({ high: 0.9, low: -0.1 }).success).toBe(false);
  });
});

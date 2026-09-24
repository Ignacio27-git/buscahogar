// ROADMAP 1.8 — buildCalibrationReport (diseño D-C3, CLI-3): función pura
// que produce la forma JSON del informe de calibración. El bloque `corpus`
// es independiente de cualquier combinación de umbrales (CLI-3a) — es lo
// que permite atribuir un conteo de cero a "sin geometría" en vez de a
// "umbrales demasiado estrictos".
import { describe, expect, it } from 'vitest';

import { buildCalibrationReport } from '../src/blocking/report.js';

describe('buildCalibrationReport (CLI-3, D-C3)', () => {
  it('CLI-3a: el bloque corpus es independiente de cualquier combinación', () => {
    const corpus = { listings: 50, withGeometry: 50, obfuscated: 0, currentVersions: 50, currentWithSurface: 50 };

    const report = buildCalibrationReport(corpus, []);

    expect(report.corpus).toEqual(corpus);
    expect(report.combinations).toEqual([]);
  });

  it('produce un elemento de combinations por cada resultado, con el desglose de pairsByObfuscation', () => {
    const corpus = { listings: 50, withGeometry: 50, obfuscated: 0, currentVersions: 50, currentWithSurface: 50 };
    const thresholds = { radiusMeters: 300, priceBandCents: 2_500_000, surfaceToleranceM2: 10 };
    const counts = { total: 12, withMissingSurface: 1, neitherObfuscated: 10, oneObfuscated: 2, bothObfuscated: 0 };

    const report = buildCalibrationReport(corpus, [{ thresholds, counts }]);

    expect(report.combinations).toEqual([
      {
        thresholds,
        candidatePairs: 12,
        pairsWithMissingSurface: 1,
        pairsByObfuscation: { neither: 10, one: 2, both: 0 },
      },
    ]);
  });
});

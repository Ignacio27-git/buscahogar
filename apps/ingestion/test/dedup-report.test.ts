// ROADMAP 1.10 — buildReprocessReport (diseño D9, REPRO-2). Función pura:
// reutiliza los tipos ya expuestos por packages/core (ClassifiedPair,
// PropertyGroup, RefusedComponent) en vez de duplicar su forma — mismo
// criterio que buildCalibrationReport (paso 1.8) con CorpusSummary/
// CandidatePairCounts.
import { describe, expect, it } from 'vitest';

import { buildReprocessReport } from '../src/dedup/report.js';

describe('buildReprocessReport (D9, REPRO-2)', () => {
  const thresholds = { radiusMeters: 300, priceBandCents: 2_500_000, surfaceToleranceM2: 10 };
  const run = {
    runId: 'run-1',
    strategyName: 'rule-based-structured',
    strategyVersion: '1.0.0',
    startedAt: '2026-01-01T00:00:00.000Z',
  };

  it('REPRO-2a: informa el total de viviendas creadas, los miembros de cada grupo de varios anuncios y el reparto de pares por banda', () => {
    const pairs = [
      { listingAId: 'a', listingBId: 'b', band: 'accept' as const, score: 0.9 },
      { listingAId: 'b', listingBId: 'c', band: 'accept' as const, score: 0.85 },
      { listingAId: 'd', listingBId: 'e', band: 'undecided' as const, score: 0.5 },
      { listingAId: 'e', listingBId: 'f', band: 'reject' as const, score: 0.1 },
    ];
    const groups = [
      { listingIds: ['a', 'b', 'c'] },
      { listingIds: ['d'] },
      { listingIds: ['e'] },
      { listingIds: ['f'] },
    ];

    const report = buildReprocessReport({
      run,
      thresholds,
      listingsConsidered: 6,
      pairs,
      groups,
      refusedComponents: [],
      propertiesCreated: groups.length,
    });

    expect(report.run).toEqual(run);
    expect(report.thresholds).toEqual(thresholds);
    expect(report.listingsConsidered).toBe(6);
    expect(report.candidatePairs).toBe(4);
    expect(report.bandCounts).toEqual({ accept: 2, undecided: 1, reject: 1 });
    expect(report.propertiesCreated).toBe(4);
    expect(report.multiMemberGroups).toEqual([{ listingIds: ['a', 'b', 'c'], size: 3 }]);
  });

  it('un componente rechazado (D2) se reporta con sus miembros y los pares que lo causaron, la cola de revisión de D9', () => {
    const conflictingPair = { listingAId: 'x', listingBId: 'z', band: 'reject' as const, score: 0.2 };
    const report = buildReprocessReport({
      run,
      thresholds,
      listingsConsidered: 3,
      pairs: [
        { listingAId: 'x', listingBId: 'y', band: 'accept' as const, score: 0.9 },
        { listingAId: 'y', listingBId: 'z', band: 'accept' as const, score: 0.9 },
        conflictingPair,
      ],
      groups: [{ listingIds: ['x'] }, { listingIds: ['y'] }, { listingIds: ['z'] }],
      refusedComponents: [{ listingIds: ['x', 'y', 'z'], conflictingPairs: [conflictingPair] }],
      propertiesCreated: 3,
    });

    expect(report.refusedComponents).toEqual([{ listingIds: ['x', 'y', 'z'], causingPairs: [conflictingPair] }]);
    // Un componente rechazado convierte a sus miembros en singletons (D2):
    // ninguno de ellos aparece en multiMemberGroups.
    expect(report.multiMemberGroups).toEqual([]);
  });

  it('sin ningún grupo de varios miembros ni ningún par, multiMemberGroups y bandCounts quedan en su estado vacío explícito', () => {
    const report = buildReprocessReport({
      run,
      thresholds,
      listingsConsidered: 1,
      pairs: [],
      groups: [{ listingIds: ['solo'] }],
      refusedComponents: [],
      propertiesCreated: 1,
    });

    expect(report.multiMemberGroups).toEqual([]);
    expect(report.candidatePairs).toBe(0);
    expect(report.bandCounts).toEqual({ accept: 0, undecided: 0, reject: 0 });
    expect(report.propertiesCreated).toBe(1);
  });
});

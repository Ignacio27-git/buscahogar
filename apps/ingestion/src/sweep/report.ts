// Paso 1.7 — report.ts (diseño, CLI-4, CLI-5, COVERAGE-6): informe de fin
// de barrido, construido a partir de los contadores acumulados por
// sweep-runner.ts. Pura: sin I/O, sin conocimiento de la base de datos.
import type { AreaQuery, Coordinates } from '@buscahogar/core';

export type SweepOutcomeKind = 'completed' | 'budget-exhausted' | 'failed';

export interface SweepReportInput {
  readonly area: AreaQuery;
  readonly outcome: SweepOutcomeKind;
  readonly inserted: number;
  readonly versioned: number;
  readonly unchanged: number;
  readonly rejectedCount: number;
  readonly resumeCursor?: string;
  readonly error?: string;
  readonly requestsSpent: number;
}

export interface SweepReport {
  readonly requestsSpent: number;
  readonly created: number;
  readonly versioned: number;
  readonly unchanged: number;
  readonly rejected: number;
  // CLI-4a: created + versioned + unchanged + rejected — debe cuadrar con
  // el total de elementos de la página procesada.
  readonly totalProcessed: number;
  readonly resumeCursor?: string;
  readonly error?: string;
  // Presente SOLO cuando outcome === 'completed' (COVERAGE-6): un barrido
  // parcial o fallido nunca puede afirmar cobertura. Cuando está presente,
  // nombra el centro y el radio explícitamente — nunca "municipio cubierto".
  readonly covered?: { readonly center: Coordinates; readonly radiusMeters: number };
}

export function buildReport(input: SweepReportInput): SweepReport {
  const totalProcessed = input.inserted + input.versioned + input.unchanged + input.rejectedCount;

  return {
    requestsSpent: input.requestsSpent,
    created: input.inserted,
    versioned: input.versioned,
    unchanged: input.unchanged,
    rejected: input.rejectedCount,
    totalProcessed,
    resumeCursor: input.resumeCursor,
    error: input.error,
    covered:
      input.outcome === 'completed'
        ? { center: input.area.center, radiusMeters: input.area.radiusMeters }
        : undefined,
  };
}

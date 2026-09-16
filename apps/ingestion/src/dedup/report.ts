// ROADMAP 1.10 — buildReprocessReport (diseño D9, REPRO-2): función PURA que
// compone el informe JSON del reproceso. Reutiliza los tipos que YA expone
// `packages/core` (`PropertyGroup`, `RefusedComponent`, `ClassifiedPair`) en
// vez de duplicar su forma — mismo criterio que `buildCalibrationReport`
// (paso 1.8) con `CorpusSummary`/`CandidatePairCounts` de `packages/db`.
import type { BlockingThresholds, ClassifiedPair, PropertyGroup, RefusedComponent } from '@buscahogar/core';

export interface ReprocessRunIdentity {
  readonly runId: string;
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly startedAt: string;
}

export interface ReprocessReportInput {
  readonly run: ReprocessRunIdentity;
  readonly thresholds: BlockingThresholds;
  readonly listingsConsidered: number;
  // TODOS los pares clasificados de la corrida, accept/undecided/reject por
  // igual (EVID-1, Q7) — el reparto por banda sale de contar esta lista
  // entera, nunca de un contador aparte que pudiera desincronizarse.
  readonly pairs: readonly ClassifiedPair[];
  readonly groups: readonly PropertyGroup[];
  readonly refusedComponents: readonly RefusedComponent[];
  readonly propertiesCreated: number;
}

export interface ReprocessGroupSummary {
  readonly listingIds: readonly string[];
  readonly size: number;
}

export interface ReprocessRefusedComponentSummary {
  readonly listingIds: readonly string[];
  readonly causingPairs: readonly ClassifiedPair[];
}

export interface ReprocessReport {
  readonly run: ReprocessRunIdentity;
  readonly thresholds: BlockingThresholds;
  readonly listingsConsidered: number;
  readonly candidatePairs: number;
  readonly bandCounts: {
    readonly accept: number;
    readonly undecided: number;
    readonly reject: number;
  };
  readonly propertiesCreated: number;
  // REPRO-2: solo los grupos de MÁS de un integrante, con su tamaño
  // explícito — un singleton (D6) no aporta nada aquí que
  // `propertiesCreated` no diga ya, y listarlos uno a uno solo diluiría la
  // señal que sí importa revisar a mano (ROADMAP 1.9's "revisar a mano una
  // muestra de los grupos formados").
  readonly multiMemberGroups: readonly ReprocessGroupSummary[];
  // D2/D9: la cola de revisión manual que ROADMAP 1.9 dejó pendiente — cada
  // componente rechazado, con sus miembros y los pares 'reject' que lo
  // causaron, reconstruible por completo desde la evidencia de la corrida.
  readonly refusedComponents: readonly ReprocessRefusedComponentSummary[];
}

export function buildReprocessReport(input: ReprocessReportInput): ReprocessReport {
  const bandCounts = { accept: 0, undecided: 0, reject: 0 };
  for (const pair of input.pairs) {
    bandCounts[pair.band] += 1;
  }

  const multiMemberGroups = input.groups
    .filter((group) => group.listingIds.length > 1)
    .map((group) => ({ listingIds: group.listingIds, size: group.listingIds.length }));

  const refusedComponents = input.refusedComponents.map((component) => ({
    listingIds: component.listingIds,
    causingPairs: component.conflictingPairs,
  }));

  return {
    run: input.run,
    thresholds: input.thresholds,
    listingsConsidered: input.listingsConsidered,
    candidatePairs: input.pairs.length,
    bandCounts,
    propertiesCreated: input.propertiesCreated,
    multiMemberGroups,
    refusedComponents,
  };
}

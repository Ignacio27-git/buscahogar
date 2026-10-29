// ROADMAP 2.5 (refresh-retention-policy, S4; decisiones 107, 108, 110) — el
// driver puro del worker con los dos planos de purga: purga de zonas (el plan
// puro de `packages/core` decide, el puerto reinicia) y tombstone de anuncios
// (marca el tick como sucio para que el reproceso de dedup reconstruya las
// cachés de las viviendas). Cada paso aislado. Puertos falsos que anotan sus
// llamadas: cero DB, cero red, cero process.env.
import { describe, expect, it } from 'vitest';

import type { RefreshTarget, ZoneLifecycleSnapshot } from '@buscahogar/core';
import type { BudgetReservation, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type {
  CoverageWorkerOptions,
  CoverageWorkerPorts,
  SweepTickResult,
  ZoneMaintenancePorts,
} from '../src/sweep/coverage-worker.js';
import type { JobLane, PollJob } from '../src/sweep/job-selection.js';

const DAY_SECONDS = 86_400;

const GEOMETRY: ZoneGeometry = {
  zoneId: 'zone-1',
  ineCode: '18087',
  municipality: 'Granada',
  state: 'covered',
  centroid: { latitude: 40.43, longitude: -3.702 },
  sweepRadiusM: 4500,
};

const JOB: PollJob = {
  jobId: 'job-1',
  zoneId: 'zone-1',
  sourceId: 'source-1',
  operation: 'sale',
  lane: 'on-demand',
};

const BASE_OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
  refreshBudgetFraction: 0.2,
};

const PURGEABLE_ZONE: ZoneLifecycleSnapshot = {
  zoneId: 'old-zone',
  operation: 'sale',
  daysSinceLastDemand: 180,
  secondsSinceLastSweep: 400 * DAY_SECONDS,
  refreshEligible: true,
};
const JUST_BEFORE_PURGE_ZONE: ZoneLifecycleSnapshot = {
  zoneId: 'held-zone',
  operation: 'sale',
  daysSinceLastDemand: 179,
  secondsSinceLastSweep: 400 * DAY_SECONDS,
  refreshEligible: true,
};
const DUE_ZONE: ZoneLifecycleSnapshot = {
  zoneId: 'due-zone',
  operation: 'sale',
  daysSinceLastDemand: 3,
  secondsSinceLastSweep: 8 * DAY_SECONDS,
  refreshEligible: true,
};

interface FakeOverrides {
  readonly job?: PollJob | null;
  readonly lifecycle?: readonly ZoneLifecycleSnapshot[];
  readonly listLifecycle?: () => Promise<readonly ZoneLifecycleSnapshot[]>;
  readonly purgeZones?: () => Promise<number>;
  readonly tombstone?: () => Promise<number>;
  readonly sweepOutcome?: SweepTickResult['outcome'];
}

interface FakePorts extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly logged: string[];
  readonly purgedBatches: (readonly string[])[];
  readonly refreshedBatches: (readonly RefreshTarget[])[];
}

function createFakePorts(overrides: FakeOverrides = {}): FakePorts {
  const calls: string[] = [];
  const logged: string[] = [];
  const purgedBatches: (readonly string[])[] = [];
  const refreshedBatches: (readonly RefreshTarget[])[] = [];
  const job = overrides.job === undefined ? JOB : overrides.job;

  const maintenance: ZoneMaintenancePorts = {
    purgeZoneQuerySignals(): Promise<number> {
      calls.push('purgeZoneQuerySignals');
      return Promise.resolve(0);
    },
    listZoneLifecycle(): Promise<readonly ZoneLifecycleSnapshot[]> {
      calls.push('listZoneLifecycle');
      return overrides.listLifecycle ? overrides.listLifecycle() : Promise.resolve(overrides.lifecycle ?? []);
    },
    purgeZones(zoneIds: readonly string[]): Promise<number> {
      calls.push('purgeZones');
      purgedBatches.push(zoneIds);
      return overrides.purgeZones ? overrides.purgeZones() : Promise.resolve(zoneIds.length);
    },
    scheduleRefresh(targets: readonly RefreshTarget[]): Promise<number> {
      calls.push('scheduleRefresh');
      refreshedBatches.push(targets);
      return Promise.resolve(targets.length);
    },
    tombstoneExpiredListings(): Promise<number> {
      calls.push('tombstoneExpiredListings');
      return overrides.tombstone ? overrides.tombstone() : Promise.resolve(0);
    },
  };

  return {
    calls,
    logged,
    purgedBatches,
    refreshedBatches,
    maintenance,
    selectNextJob(): Promise<PollJob | null> {
      calls.push('selectNextJob');
      return Promise.resolve(job);
    },
    resolveZoneGeometry(): Promise<ZoneGeometry> {
      return Promise.resolve(GEOMETRY);
    },
    failJob(): Promise<void> {
      return Promise.resolve();
    },
    reserveBudget(_reservation: BudgetReservation, _lane: JobLane): Promise<LedgerState | null> {
      calls.push('reserveBudget');
      return Promise.resolve({ searchRequests: 10, tokenRequests: 1 });
    },
    reconcileBudget(): Promise<void> {
      return Promise.resolve();
    },
    claimAndSweep(): Promise<SweepTickResult> {
      calls.push('claimAndSweep');
      return Promise.resolve({ outcome: overrides.sweepOutcome ?? 'completed', actual: { search: 3, token: 1 } });
    },
    runDedup(): Promise<void> {
      calls.push('runDedup');
      return Promise.resolve();
    },
    purgeClientQuota(): Promise<void> {
      calls.push('purgeClientQuota');
      return Promise.resolve();
    },
    sleep(): Promise<void> {
      return Promise.resolve();
    },
    log(line: string): void {
      logged.push(line);
    },
  };
}

const MAINTENANCE_CALLS = [
  'purgeZoneQuerySignals',
  'listZoneLifecycle',
  'purgeZones',
  'scheduleRefresh',
  'tombstoneExpiredListings',
];

describe('runCoverageWorker — purgas en el mantenimiento (S-CWT-1, decisión 108)', () => {
  it('orden: señales, ciclo de vida, purga de zonas, re-encolado, tombstone; y solo después el barrido', async () => {
    const ports = createFakePorts({ lifecycle: [PURGEABLE_ZONE, DUE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    const order = ports.calls.filter((call) => [...MAINTENANCE_CALLS, 'selectNextJob', 'claimAndSweep'].includes(call));
    expect(order).toEqual([...MAINTENANCE_CALLS, 'selectNextJob', 'claimAndSweep']);
  });

  it('el plan puro decide: solo la zona con d >= 180 llega a purgeZones (la de 179 no, y la purgable no se refresca)', async () => {
    const ports = createFakePorts({ lifecycle: [PURGEABLE_ZONE, JUST_BEFORE_PURGE_ZONE, DUE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.purgedBatches).toEqual([['old-zone']]);
    expect(ports.refreshedBatches).toEqual([[{ zoneId: 'due-zone', operation: 'sale' }]]);
  });

  it('sin zonas purgables, purgeZones no se invoca', async () => {
    const ports = createFakePorts({ lifecycle: [DUE_ZONE, JUST_BEFORE_PURGE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('purgeZones');
  });

  it('la purga de zonas no gasta cuota, así que corre con la fracción de refresco en 0 (el re-encolado no)', async () => {
    const ports = createFakePorts({ lifecycle: [PURGEABLE_ZONE, DUE_ZONE] });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, refreshBudgetFraction: 0 });

    expect(ports.purgedBatches).toEqual([['old-zone']]);
    expect(ports.calls).not.toContain('scheduleRefresh');
  });

  it('si listZoneLifecycle lanza: purga y re-encolado se omiten, pero el tombstone y el barrido siguen', async () => {
    const ports = createFakePorts({
      listLifecycle: (): Promise<readonly ZoneLifecycleSnapshot[]> => Promise.reject(new Error('fallo al listar')),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('purgeZones');
    expect(ports.calls).not.toContain('scheduleRefresh');
    expect(ports.calls).toContain('tombstoneExpiredListings');
    expect(ports.calls).toContain('claimAndSweep');
  });
});

describe('runCoverageWorker — aislamiento de las purgas (S-CWT-3, decisión 110)', () => {
  it('si purgeZones lanza: se registra con su nombre y el re-encolado, el tombstone y el barrido siguen', async () => {
    const ports = createFakePorts({
      lifecycle: [PURGEABLE_ZONE, DUE_ZONE],
      purgeZones: (): Promise<number> => Promise.reject(new Error('fallo al purgar')),
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.logged).toContain('coverage-worker: paso "purga-de-zonas" falló: fallo al purgar');
    expect(ports.calls).toContain('scheduleRefresh');
    expect(ports.calls).toContain('tombstoneExpiredListings');
    expect(ports.calls).toContain('claimAndSweep');
  });

  it('si tombstoneExpiredListings lanza: se registra con su nombre, el barrido sigue y el tick no queda sucio por él', async () => {
    const ports = createFakePorts({
      sweepOutcome: 'budget-exhausted',
      tombstone: (): Promise<number> => Promise.reject(new Error('fallo al redactar')),
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.logged).toContain('coverage-worker: paso "tombstone-de-anuncios" falló: fallo al redactar');
    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).not.toContain('runDedup');
  });
});

describe('runCoverageWorker — el tombstone ensucia el tick (S-CWT-10, RP-9)', () => {
  it('con tombstones > 0 y sin barrido completado se lanza runDedup (reconstruye las cachés de las viviendas)', async () => {
    const ports = createFakePorts({ job: null, tombstone: (): Promise<number> => Promise.resolve(3) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('tombstoneExpiredListings');
    expect(ports.calls.filter((call) => call === 'runDedup')).toHaveLength(1);
  });

  it('con tombstones = 0 y sin barrido completado no se lanza runDedup', async () => {
    const ports = createFakePorts({ job: null, tombstone: (): Promise<number> => Promise.resolve(0) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('tombstoneExpiredListings');
    expect(ports.calls).not.toContain('runDedup');
  });

  it('tombstones > 0 Y barrido completado: como mucho UN reproceso por tick', async () => {
    const ports = createFakePorts({ tombstone: (): Promise<number> => Promise.resolve(2) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.filter((call) => call === 'runDedup')).toHaveLength(1);
  });

  it('una purga de zonas por sí sola no ensucia el tick (la visibilidad ya se refrescó en la transacción)', async () => {
    const ports = createFakePorts({ job: null, lifecycle: [PURGEABLE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.purgedBatches).toEqual([['old-zone']]);
    expect(ports.calls).not.toContain('runDedup');
  });
});

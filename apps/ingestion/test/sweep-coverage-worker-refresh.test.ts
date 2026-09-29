// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104/110) — el driver
// puro del worker con el carril de refresco: mantenimiento aislado por paso,
// throttling por ticks, reserva por carril ANTES de reclamar y salto del
// re-encolado con fracción 0. Igual que `sweep-coverage-worker.test.ts` (que
// sigue SIN CAMBIOS, S-CWT-12): puertos falsos que anotan sus llamadas,
// cero DB, cero red, cero process.env.
import { describe, expect, it } from 'vitest';

import type { ZoneLifecycleSnapshot } from '@buscahogar/core';
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

const ON_DEMAND_JOB: PollJob = { jobId: 'job-1', zoneId: 'zone-1', sourceId: 'source-1', lane: 'on-demand' };
const REFRESH_JOB: PollJob = { jobId: 'job-2', zoneId: 'zone-2', sourceId: 'source-1', lane: 'refresh' };

const BASE_OPTIONS: CoverageWorkerOptions = {
  operation: 'sale',
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
  refreshBudgetFraction: 0.2,
};

// Zona semanal (d = 3) barrida hace 8 días y elegible: vence -> se re-encola.
const DUE_ZONE: ZoneLifecycleSnapshot = {
  zoneId: 'due-zone',
  daysSinceLastDemand: 3,
  secondsSinceLastSweep: 8 * DAY_SECONDS,
  refreshEligible: true,
};

interface FakeOverrides {
  readonly job?: PollJob | null;
  readonly lifecycle?: readonly ZoneLifecycleSnapshot[];
  readonly purgeSignals?: () => Promise<number>;
  readonly listLifecycle?: () => Promise<readonly ZoneLifecycleSnapshot[]>;
  readonly scheduleRefresh?: () => Promise<number>;
  readonly reserveBudget?: () => Promise<LedgerState | null>;
  readonly claimAndSweep?: () => Promise<SweepTickResult>;
  readonly withMaintenance?: boolean;
}

interface FakePorts extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly logged: string[];
  readonly reserveCalls: (readonly [BudgetReservation, JobLane])[];
  readonly scheduledBatches: (readonly string[])[];
}

function createFakePorts(overrides: FakeOverrides = {}): FakePorts {
  const calls: string[] = [];
  const logged: string[] = [];
  const reserveCalls: (readonly [BudgetReservation, JobLane])[] = [];
  const scheduledBatches: (readonly string[])[] = [];
  const job = overrides.job === undefined ? ON_DEMAND_JOB : overrides.job;

  const maintenance: ZoneMaintenancePorts = {
    purgeZoneQuerySignals(): Promise<number> {
      calls.push('purgeZoneQuerySignals');
      return overrides.purgeSignals ? overrides.purgeSignals() : Promise.resolve(0);
    },
    listZoneLifecycle(): Promise<readonly ZoneLifecycleSnapshot[]> {
      calls.push('listZoneLifecycle');
      return overrides.listLifecycle ? overrides.listLifecycle() : Promise.resolve(overrides.lifecycle ?? []);
    },
    scheduleRefresh(zoneIds: readonly string[]): Promise<number> {
      calls.push('scheduleRefresh');
      scheduledBatches.push(zoneIds);
      return overrides.scheduleRefresh ? overrides.scheduleRefresh() : Promise.resolve(zoneIds.length);
    },
  };

  return {
    calls,
    logged,
    reserveCalls,
    scheduledBatches,
    ...(overrides.withMaintenance === false ? {} : { maintenance }),
    selectNextJob(): Promise<PollJob | null> {
      calls.push('selectNextJob');
      return Promise.resolve(job);
    },
    resolveZoneGeometry(): Promise<ZoneGeometry> {
      calls.push('resolveZoneGeometry');
      return Promise.resolve(GEOMETRY);
    },
    failJob(): Promise<void> {
      calls.push('failJob');
      return Promise.resolve();
    },
    reserveBudget(reservation: BudgetReservation, lane: JobLane): Promise<LedgerState | null> {
      calls.push('reserveBudget');
      reserveCalls.push([reservation, lane]);
      return overrides.reserveBudget
        ? overrides.reserveBudget()
        : Promise.resolve({ searchRequests: 10, tokenRequests: 1 });
    },
    reconcileBudget(): Promise<void> {
      calls.push('reconcileBudget');
      return Promise.resolve();
    },
    claimAndSweep(): Promise<SweepTickResult> {
      calls.push('claimAndSweep');
      return overrides.claimAndSweep
        ? overrides.claimAndSweep()
        : Promise.resolve({ outcome: 'completed', actual: { search: 3, token: 1 } });
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
      calls.push('sleep');
      return Promise.resolve();
    },
    log(line: string): void {
      logged.push(line);
    },
  };
}

describe('runCoverageWorker — orden del tick con mantenimiento (S-CWT-1)', () => {
  it('purgeClientQuota primero; luego señales, ciclo de vida de zonas y re-encolado; y solo después el barrido', async () => {
    const ports = createFakePorts({ lifecycle: [DUE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    const order = ports.calls.filter((call) =>
      ['purgeClientQuota', 'purgeZoneQuerySignals', 'listZoneLifecycle', 'scheduleRefresh', 'selectNextJob', 'claimAndSweep'].includes(call)
    );
    expect(order).toEqual([
      'purgeClientQuota',
      'purgeZoneQuerySignals',
      'listZoneLifecycle',
      'scheduleRefresh',
      'selectNextJob',
      'claimAndSweep',
    ]);
  });

  it('el planificador puro decide: solo la zona vencida y elegible llega a scheduleRefresh', async () => {
    const ports = createFakePorts({
      lifecycle: [
        DUE_ZONE,
        { zoneId: 'fresh-zone', daysSinceLastDemand: 3, secondsSinceLastSweep: 2 * DAY_SECONDS, refreshEligible: true },
        { zoneId: 'held-zone', daysSinceLastDemand: 120, secondsSinceLastSweep: 400 * DAY_SECONDS, refreshEligible: true },
        { zoneId: 'busy-zone', daysSinceLastDemand: 3, secondsSinceLastSweep: 20 * DAY_SECONDS, refreshEligible: false },
      ],
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.scheduledBatches).toEqual([['due-zone']]);
  });

  it('S-CWT-5: nada vencido -> scheduleRefresh no se invoca y no hay trabajo -> cero llamadas a la fuente', async () => {
    const ports = createFakePorts({ job: null, lifecycle: [] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('scheduleRefresh');
    expect(ports.calls).not.toContain('claimAndSweep');
    expect(ports.calls).not.toContain('reserveBudget');
  });
});

describe('runCoverageWorker — fracción de refresco 0 o ausente desactiva el re-encolado (S-ZRS-10)', () => {
  it('con refreshBudgetFraction = 0 no se re-encola nada aunque haya zonas vencidas', async () => {
    const ports = createFakePorts({ lifecycle: [DUE_ZONE] });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, refreshBudgetFraction: 0 });

    expect(ports.calls).toContain('listZoneLifecycle');
    expect(ports.calls).not.toContain('scheduleRefresh');
  });

  it('sin refreshBudgetFraction (opción ausente) el comportamiento es el mismo: refresco desactivado por defecto', async () => {
    const ports = createFakePorts({ lifecycle: [DUE_ZONE] });
    const withoutFraction: CoverageWorkerOptions = {
      operation: 'sale',
      pollIntervalMs: 10,
      maxSearchRequestsPerSweep: 10,
      dailySearchCap: 500,
      maxAttempts: 3,
      maxTicks: 1,
    };

    await runCoverageWorker(ports, withoutFraction);

    expect(ports.calls).not.toContain('scheduleRefresh');
  });
});

describe('runCoverageWorker — throttling del mantenimiento (S-CWT-2)', () => {
  it('maintenanceEveryTicks = 3: el mantenimiento corre en los ticks 1, 4 y 7 y no en los demás', async () => {
    const ports = createFakePorts({ job: null });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 7, maintenanceEveryTicks: 3 });

    expect(ports.calls.filter((call) => call === 'purgeZoneQuerySignals')).toHaveLength(3);
    // Los índices de tick con mantenimiento, reconstruidos del log de llamadas:
    // cada tick empieza con purgeClientQuota.
    const tickOfMaintenance: number[] = [];
    let tick = 0;
    for (const call of ports.calls) {
      if (call === 'purgeClientQuota') tick += 1;
      if (call === 'purgeZoneQuerySignals') tickOfMaintenance.push(tick);
    }
    expect(tickOfMaintenance).toEqual([1, 4, 7]);
  });

  it('por defecto (sin maintenanceEveryTicks) el mantenimiento corre en cada tick', async () => {
    const ports = createFakePorts({ job: null });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 3 });

    expect(ports.calls.filter((call) => call === 'purgeZoneQuerySignals')).toHaveLength(3);
  });

  it('sin puertos de mantenimiento (composición anterior a 2.5) el tick se comporta como antes', async () => {
    const ports = createFakePorts({ withMaintenance: false });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('purgeZoneQuerySignals');
    expect(ports.calls).toContain('claimAndSweep');
  });
});

describe('runCoverageWorker — aislamiento de fallos por paso (S-CWT-3, S-CWT-4, decisión 110)', () => {
  it('si purgeZoneQuerySignals lanza, el tick continúa: ciclo de vida, re-encolado y barrido se ejecutan, y el fallo se registra con el nombre del paso', async () => {
    const ports = createFakePorts({
      lifecycle: [DUE_ZONE],
      purgeSignals: (): Promise<number> => Promise.reject(new Error('fallo simulado de la BD')),
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.calls).toContain('listZoneLifecycle');
    expect(ports.calls).toContain('scheduleRefresh');
    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.logged).toContain('coverage-worker: paso "purga-señales-de-zona" falló: fallo simulado de la BD');
  });

  it('si listZoneLifecycle lanza: la purga de señales ya corrió, el re-encolado se omite y el barrido sigue', async () => {
    const ports = createFakePorts({
      listLifecycle: (): Promise<readonly ZoneLifecycleSnapshot[]> => Promise.reject(new Error('fallo al listar')),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.indexOf('purgeZoneQuerySignals')).toBeGreaterThanOrEqual(0);
    expect(ports.calls).not.toContain('scheduleRefresh');
    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.logged.some((line) => line.includes('paso "ciclo-de-vida-de-zonas" falló: fallo al listar'))).toBe(true);
  });

  it('si scheduleRefresh lanza, el barrido sigue y el fallo se registra', async () => {
    const ports = createFakePorts({
      lifecycle: [DUE_ZONE],
      scheduleRefresh: (): Promise<number> => Promise.reject(new Error('fallo al re-encolar')),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.logged.some((line) => line.includes('paso "re-encolado-de-refresco" falló: fallo al re-encolar'))).toBe(true);
  });

  it('el aislamiento NO enmascara un fallo del barrido: un error de claimAndSweep sigue propagándose', async () => {
    const ports = createFakePorts({
      claimAndSweep: (): Promise<SweepTickResult> => Promise.reject(new Error('fallo inesperado del barrido')),
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).rejects.toThrow('fallo inesperado del barrido');
  });

  it('un valor lanzado que no es Error también se aísla y registra como texto', async () => {
    const ports = createFakePorts({
      // Un valor lanzado que no es Error: es justo lo que el aislamiento debe tolerar.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      purgeSignals: (): Promise<number> => Promise.reject('texto plano'),
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.logged).toContain('coverage-worker: paso "purga-señales-de-zona" falló: texto plano');
  });
});

describe('runCoverageWorker — reserva por carril ANTES de reclamar (S-ZRS-19, S-CWT-8)', () => {
  it('un job a demanda reserva por el carril "on-demand"', async () => {
    const ports = createFakePorts({ job: ON_DEMAND_JOB });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.reserveCalls).toHaveLength(1);
    expect(ports.reserveCalls[0]?.[1]).toBe('on-demand');
  });

  it('un job de refresco reserva por el carril "refresh"', async () => {
    const ports = createFakePorts({ job: REFRESH_JOB });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.reserveCalls).toHaveLength(1);
    expect(ports.reserveCalls[0]?.[1]).toBe('refresh');
  });

  it('un job sin carril declarado (composición anterior a 2.5) se trata como a demanda', async () => {
    const ports = createFakePorts({ job: { jobId: 'job-9', zoneId: 'zone-9', sourceId: 'source-1' } });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.reserveCalls[0]?.[1]).toBe('on-demand');
  });

  it('S-ZRS-19: reserva DENEGADA en el carril de refresco -> no se reclama nada (claimAndSweep no se invoca) y el tick duerme', async () => {
    const ports = createFakePorts({
      job: REFRESH_JOB,
      reserveBudget: (): Promise<LedgerState | null> => Promise.resolve(null),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('claimAndSweep');
    expect(ports.calls.indexOf('reserveBudget')).toBeGreaterThanOrEqual(0);
    expect(ports.calls).toContain('sleep');
    expect(ports.logged.some((line) => line.includes('job-2'))).toBe(true);
  });

  it('S-CWT-6: con fakes que nunca se agotan, un tick procesa EXACTAMENTE un barrido (corte por tick)', async () => {
    const ports = createFakePorts({ job: REFRESH_JOB, lifecycle: [DUE_ZONE] });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.filter((call) => call === 'claimAndSweep')).toHaveLength(1);
    expect(ports.calls.filter((call) => call === 'selectNextJob')).toHaveLength(1);
  });
});

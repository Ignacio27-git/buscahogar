// ROADMAP 1.13 Unit C (diseño DD-17, DD-18) — coverage-worker.ts probado
// enteramente contra `CoverageWorkerPorts` falsos — cero DB, cero red, cero
// process.env. Mismo espíritu que sweep-runner.test.ts (fase 1): el driver
// puro se demuestra con fakes que anotan sus llamadas en arrays propios (no
// `vi.fn()`: las interfaces de puerto de este paquete usan sintaxis de
// método, no propiedad-función, así que pasar `ports.metodo` como valor a
// `expect()` dispara `@typescript-eslint/unbound-method` — mismo motivo por
// el que `createFakeStore`, en ese mismo fichero, anota en
// `persistCalls`/`finishCalls` en vez de envolver con `vi.fn()`). La
// reutilización real de runSweep/composeStore/etc. se demuestra por
// separado contra PostgreSQL real (test/db/coverage-worker-ports.db.test.ts).
//
// Nombrado `sweep-coverage-worker.test.ts` (plano, en test/), no
// `test/sweep/coverage-worker.test.ts`: sigue la convención REAL ya
// establecida por los hermanos de esta misma fase (sweep-runner.test.ts,
// sweep-options.test.ts, sweep-area.test.ts, sweep-job-cursor.test.ts,
// sweep-report.test.ts) en vez de la ruta literal de tasks.md, que
// introduciría un subdirectorio nuevo sin ningún otro precedente en este
// paquete — mismo criterio que la corrección de ruta ya documentada para la
// tarea 6.13 (Unit B).
import { describe, expect, it } from 'vitest';

import type { Coordinates } from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { JobAlreadyClaimedError } from '../src/sweep/coverage-store.js';
import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions, CoverageWorkerPorts, SweepTickResult } from '../src/sweep/coverage-worker.js';
import type { PollJob } from '../src/sweep/job-selection.js';

const CENTER: Coordinates = { latitude: 40.43, longitude: -3.702 };

function zoneGeometry(overrides: Partial<ZoneGeometry> = {}): ZoneGeometry {
  return {
    zoneId: 'zone-1',
    ineCode: '18087',
    municipality: 'Granada',
    state: 'uncovered',
    centroid: CENTER,
    sweepRadiusM: 4500,
    ...overrides,
  };
}

const JOB: PollJob = { jobId: 'job-1', zoneId: 'zone-1', sourceId: 'source-1' };

const BASE_OPTIONS: CoverageWorkerOptions = {
  operation: 'sale',
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
};

interface FakePorts extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly failJobCalls: (readonly [string, string])[];
  readonly claimAndSweepCalls: unknown[];
  readonly reconcileBudgetCalls: (readonly [BudgetReservation, BudgetSnapshotLike])[];
}

interface FakePortsOverrides {
  readonly selectNextJob?: () => Promise<PollJob | null>;
  readonly resolveZoneGeometry?: () => Promise<ZoneGeometry>;
  readonly reserveBudget?: () => Promise<LedgerState | null>;
  readonly claimAndSweep?: () => Promise<SweepTickResult>;
}

function createFakePorts(overrides: FakePortsOverrides = {}): FakePorts {
  const calls: string[] = [];
  const failJobCalls: (readonly [string, string])[] = [];
  const claimAndSweepCalls: unknown[] = [];
  const reconcileBudgetCalls: (readonly [BudgetReservation, BudgetSnapshotLike])[] = [];

  return {
    calls,
    failJobCalls,
    claimAndSweepCalls,
    reconcileBudgetCalls,
    selectNextJob(): Promise<PollJob | null> {
      calls.push('selectNextJob');
      return overrides.selectNextJob ? overrides.selectNextJob() : Promise.resolve(JOB);
    },
    resolveZoneGeometry(): Promise<ZoneGeometry> {
      calls.push('resolveZoneGeometry');
      return overrides.resolveZoneGeometry ? overrides.resolveZoneGeometry() : Promise.resolve(zoneGeometry());
    },
    failJob(jobId: string, reason: string): Promise<void> {
      calls.push('failJob');
      failJobCalls.push([jobId, reason]);
      return Promise.resolve();
    },
    reserveBudget(): Promise<LedgerState | null> {
      calls.push('reserveBudget');
      return overrides.reserveBudget ? overrides.reserveBudget() : Promise.resolve({ searchRequests: 10, tokenRequests: 1 });
    },
    reconcileBudget(reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void> {
      calls.push('reconcileBudget');
      reconcileBudgetCalls.push([reserved, actual]);
      return Promise.resolve();
    },
    claimAndSweep(job, area, fingerprint): Promise<SweepTickResult> {
      calls.push('claimAndSweep');
      claimAndSweepCalls.push([job, area, fingerprint]);
      return overrides.claimAndSweep
        ? overrides.claimAndSweep()
        : Promise.resolve({ outcome: 'completed', actual: { search: 3, token: 1 } });
    },
    runDedup(): Promise<void> {
      calls.push('runDedup');
      return Promise.resolve();
    },
    sleep(): Promise<void> {
      calls.push('sleep');
      return Promise.resolve();
    },
    log(): void {
      calls.push('log');
    },
  };
}

describe('runCoverageWorker — A-8: sin argumento --zone de CLI, un trabajo pending se procesa desde la cola', () => {
  it('claimAndSweep recibe el trabajo seleccionado por selectNextJob, con un AreaQuery construido desde la geometría', async () => {
    const ports = createFakePorts();

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.claimAndSweepCalls).toHaveLength(1);
    const [job, area] = ports.claimAndSweepCalls[0] as [PollJob, { center: Coordinates; radiusMeters: number; operation: string }];
    expect(job).toEqual(JOB);
    expect(area.center).toEqual(CENTER);
    expect(area.radiusMeters).toBe(4500);
    expect(area.operation).toBe('sale');
  });

  it('DD-18 paso 5 antes del paso 7 (A-8.2): reserveBudget se invoca SIEMPRE antes de claimAndSweep', async () => {
    const ports = createFakePorts();

    await runCoverageWorker(ports, BASE_OPTIONS);

    const reserveIndex = ports.calls.indexOf('reserveBudget');
    const claimIndex = ports.calls.indexOf('claimAndSweep');
    expect(reserveIndex).toBeGreaterThanOrEqual(0);
    expect(claimIndex).toBeGreaterThan(reserveIndex);
  });
});

describe('runCoverageWorker — A-8.1: JobAlreadyClaimedError es una señal no fatal de sondeo', () => {
  it('la reserva se reembolsa por completo y el tick continúa sin lanzar', async () => {
    const ports = createFakePorts({
      claimAndSweep: (): Promise<SweepTickResult> => {
        throw new JobAlreadyClaimedError('zone-1', 'source-1');
      },
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.reconcileBudgetCalls).toHaveLength(1);
    const [reserved, actual] = ports.reconcileBudgetCalls[0] as [BudgetReservation, BudgetSnapshotLike];
    expect(reserved.searchReserved).toBe(BASE_OPTIONS.maxSearchRequestsPerSweep);
    expect(actual).toEqual({ search: 0, token: 0 });
    expect(ports.calls).not.toContain('runDedup');
  });

  it('un error que NO es JobAlreadyClaimedError se propaga (no se enmascara en silencio)', async () => {
    const ports = createFakePorts({
      claimAndSweep: (): Promise<SweepTickResult> => {
        throw new Error('fallo inesperado, no cubierto por A-8.1');
      },
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).rejects.toThrow('fallo inesperado');
  });
});

describe('runCoverageWorker — A-8.2: el presupuesto se comprueba ANTES de claimJob, nunca después', () => {
  it('presupuesto agotado (reserveBudget devuelve null): claimAndSweep nunca se invoca, cero peticiones', async () => {
    const ports = createFakePorts({
      reserveBudget: (): Promise<LedgerState | null> => Promise.resolve(null),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.claimAndSweepCalls).toHaveLength(0);
    expect(ports.reconcileBudgetCalls).toHaveLength(0);
    expect(ports.calls.filter((call) => call === 'sleep')).toHaveLength(1);
  });
});

describe('runCoverageWorker — DD-5 surfacing worker-side: un centroide nulo aborta ANTES de reservar presupuesto', () => {
  it('failJob se invoca con un motivo nombrado; ni reserveBudget ni claimAndSweep se llegan a invocar', async () => {
    const ports = createFakePorts({
      resolveZoneGeometry: (): Promise<ZoneGeometry> => Promise.resolve(zoneGeometry({ centroid: null, sweepRadiusM: null })),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.failJobCalls).toHaveLength(1);
    const [jobId, reason] = ports.failJobCalls[0] as [string, string];
    expect(jobId).toBe(JOB.jobId);
    expect(reason.length).toBeGreaterThan(0);
    expect(ports.calls).not.toContain('reserveBudget');
    expect(ports.claimAndSweepCalls).toHaveLength(0);
  });
});

describe('runCoverageWorker — sin trabajos reclamables', () => {
  it('duerme el intervalo configurado y no invoca ningún otro puerto de escritura', async () => {
    const ports = createFakePorts({
      selectNextJob: (): Promise<PollJob | null> => Promise.resolve(null),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.filter((call) => call === 'sleep')).toHaveLength(1);
    expect(ports.calls).not.toContain('resolveZoneGeometry');
    expect(ports.calls).not.toContain('reserveBudget');
    expect(ports.calls).not.toContain('runDedup');
  });
});

describe('runCoverageWorker — DD-18 paso 11/12: dedup coalescida, como mucho una vez por tick', () => {
  it('un tick "completed" ejecuta runDedup exactamente una vez, tras el barrido', async () => {
    const ports = createFakePorts();

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.filter((call) => call === 'runDedup')).toHaveLength(1);
    expect(ports.calls.indexOf('runDedup')).toBeGreaterThan(ports.calls.indexOf('claimAndSweep'));
  });

  it('un tick "budget-exhausted" o "failed" NO ejecuta runDedup', async () => {
    const ports = createFakePorts({
      claimAndSweep: (): Promise<SweepTickResult> => Promise.resolve({ outcome: 'failed', actual: { search: 1, token: 1 } }),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('runDedup');
  });

  it('varios ticks "completed" ejecutan runDedup una vez POR TICK (coalescido, no acumulado entre ticks)', async () => {
    const ports = createFakePorts();
    const manyTicks: CoverageWorkerOptions = { ...BASE_OPTIONS, maxTicks: 3 };

    await runCoverageWorker(ports, manyTicks);

    expect(ports.claimAndSweepCalls).toHaveLength(3);
    expect(ports.calls.filter((call) => call === 'runDedup')).toHaveLength(3);
  });
});

describe('runCoverageWorker — maxTicks acotado en test ⇒ terminación determinista, sin temporizadores reales', () => {
  it('se detiene exactamente tras maxTicks, sin bucle infinito', async () => {
    const ports = createFakePorts({
      selectNextJob: (): Promise<PollJob | null> => Promise.resolve(null),
    });
    const bounded: CoverageWorkerOptions = { ...BASE_OPTIONS, maxTicks: 5 };

    await runCoverageWorker(ports, bounded);

    expect(ports.calls.filter((call) => call === 'selectNextJob')).toHaveLength(5);
  });
});

describe('runCoverageWorker — R11: apagado ordenado (SIGINT/SIGTERM en el composition root)', () => {
  it('shouldContinue devolviendo false ANTES del siguiente tick detiene el bucle sin arrancar uno nuevo', async () => {
    const ports = createFakePorts({
      selectNextJob: (): Promise<PollJob | null> => Promise.resolve(null),
    });
    let allowedTicks = 2;
    const options: CoverageWorkerOptions = {
      ...BASE_OPTIONS,
      maxTicks: undefined,
      shouldContinue: () => {
        if (allowedTicks <= 0) return false;
        allowedTicks -= 1;
        return true;
      },
    };

    await runCoverageWorker(ports, options);

    // El tick EN CURSO siempre se completa (mismo tick que decrementó
    // allowedTicks a 0 sigue corriendo entero); el bucle nunca arranca un
    // tick adicional una vez shouldContinue devuelve false.
    expect(ports.calls.filter((call) => call === 'selectNextJob')).toHaveLength(2);
  });

  it('sin shouldContinue (composition root en producción), el bucle sigue corriendo — solo maxTicks lo acota en test', async () => {
    const ports = createFakePorts({
      selectNextJob: (): Promise<PollJob | null> => Promise.resolve(null),
    });
    const bounded: CoverageWorkerOptions = { ...BASE_OPTIONS, maxTicks: 3 };

    await runCoverageWorker(ports, bounded);

    expect(ports.calls.filter((call) => call === 'selectNextJob')).toHaveLength(3);
  });
});

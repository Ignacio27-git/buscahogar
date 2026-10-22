// ROADMAP 3.4 (decisión 258, D14, D16; R6.2, R6.5) — el driver puro del worker frente a una parada pedida y al
// gancho posterior a un tick correcto (latido). Mismos principios que sweep-coverage-worker.test.ts: puertos
// falsos que anotan sus llamadas, cero DB, cero red, cero temporizadores.
import { describe, expect, it } from 'vitest';

import type { PartitionedPresence, PresenceBatch } from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { createOutboundBudget } from '../src/ops/outbound-budget.js';
import type { OutboundBudget } from '../src/ops/outbound-budget.js';
import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type {
  CoverageWorkerOptions,
  CoverageWorkerPorts,
  PresencePlan,
  SweepTickResult,
} from '../src/sweep/coverage-worker.js';
import type { PollJob } from '../src/sweep/job-selection.js';

const GEOMETRY: ZoneGeometry = {
  zoneId: 'zone-1',
  ineCode: '18087',
  municipality: 'Granada',
  state: 'uncovered',
  centroid: { latitude: 37.18, longitude: -3.6 },
  sweepRadiusM: 4500,
};
const JOB: PollJob = { jobId: 'job-1', zoneId: 'zone-1', sourceId: 'source-1', operation: 'sale' };
const BASE_OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
};

interface Hooks {
  readonly onPurge?: () => void;
  readonly claimAndSweep?: () => Promise<SweepTickResult>;
  readonly selectNextJob?: () => Promise<PollJob | null>;
  readonly onTickSuccess?: (budget: OutboundBudget) => Promise<void>;
}

interface Fake extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly reconciled: BudgetSnapshotLike[];
}

function createFake(hooks: Hooks = {}, withVerification = false): Fake {
  const calls: string[] = [];
  const reconciled: BudgetSnapshotLike[] = [];
  const verification = withVerification
    ? {
        markAbsenceCandidates: (): Promise<number> => {
          calls.push('markAbsenceCandidates');
          return Promise.resolve(0);
        },
        nextPresenceBatches: (): Promise<PresencePlan> => {
          calls.push('nextPresenceBatches');
          const batches: readonly PresenceBatch[] = [];
          return Promise.resolve({ batches, listingIdByExternalId: new Map(), unverifiableListingIds: [] });
        },
        verifyPresence: (): Promise<never> => {
          calls.push('verifyPresence');
          return Promise.reject(new Error('no debe verificar'));
        },
        applyPresence: (_result: PartitionedPresence): Promise<void> => {
          calls.push('applyPresence');
          return Promise.resolve();
        },
      }
    : undefined;
  return {
    calls,
    reconciled,
    ...(verification ? { verification } : {}),
    ...(hooks.onTickSuccess ? { onTickSuccess: hooks.onTickSuccess } : {}),
    selectNextJob(): Promise<PollJob | null> {
      calls.push('selectNextJob');
      return hooks.selectNextJob ? hooks.selectNextJob() : Promise.resolve(JOB);
    },
    resolveZoneGeometry: () => Promise.resolve(GEOMETRY),
    failJob: () => Promise.resolve(),
    reserveBudget(): Promise<LedgerState | null> {
      calls.push('reserveBudget');
      return Promise.resolve({ searchRequests: 10, tokenRequests: 1 });
    },
    reconcileBudget(_reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void> {
      calls.push('reconcileBudget');
      reconciled.push(actual);
      return Promise.resolve();
    },
    claimAndSweep(): Promise<SweepTickResult> {
      calls.push('claimAndSweep');
      return hooks.claimAndSweep
        ? hooks.claimAndSweep()
        : Promise.resolve({ outcome: 'completed', actual: { search: 3, token: 1 } });
    },
    runDedup(): Promise<void> {
      calls.push('runDedup');
      return Promise.resolve();
    },
    purgeClientQuota(): Promise<void> {
      calls.push('purgeClientQuota');
      hooks.onPurge?.();
      return Promise.resolve();
    },
    sleep(): Promise<void> {
      calls.push('sleep');
      return Promise.resolve();
    },
    log(line: string): void {
      calls.push(`log:${line}`);
    },
  };
}

describe('createOutboundBudget (D16, D17)', () => {
  it('concede exactamente `max` plazas y luego deniega', () => {
    const budget = createOutboundBudget(2);

    expect([budget.remaining(), budget.tryTake(), budget.remaining(), budget.tryTake(), budget.tryTake()]).toEqual([
      2,
      true,
      1,
      true,
      false,
    ]);
    expect(budget.remaining()).toBe(0);
  });

  it('un tope de 0 no concede nada', () => {
    expect(createOutboundBudget(0).tryTake()).toBe(false);
  });

  it('rechaza un tope negativo o no entero (corte explícito, nunca un valor inventado)', () => {
    expect(() => createOutboundBudget(-1)).toThrow(/tope/);
    expect(() => createOutboundBudget(1.5)).toThrow(/tope/);
  });
});

describe('runCoverageWorker — parada pedida a mitad del tick (R6.2)', () => {
  it('si la parada llega antes de elegir trabajo, no se elige ni se reserva nada, no se duerme y el bucle termina', async () => {
    let stop = false;
    const ports = createFake({
      onPurge: () => {
        stop = true;
      },
    });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 5, shouldContinue: () => !stop, shouldStop: () => stop });

    expect(ports.calls).toEqual(['purgeClientQuota']);
  });

  it('un tick que arranca sin parada barre normalmente (control: la comprobación no impide el barrido)', async () => {
    const ports = createFake();

    await runCoverageWorker(ports, { ...BASE_OPTIONS, shouldContinue: () => true, shouldStop: () => false });

    expect(ports.calls).toContain('selectNextJob');
    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).toContain('runDedup');
  });

  it('un barrido detenido en el límite de página reconcilia el presupuesto con lo gastado, no ejecuta dedup y no verifica presencia', async () => {
    let stop = false;
    const ports = createFake(
      {
        claimAndSweep: () => {
          stop = true;
          return Promise.resolve({ outcome: 'budget-exhausted', actual: { search: 1, token: 1 } });
        },
        selectNextJob: () => Promise.resolve({ ...JOB, lane: 'refresh' }),
      },
      true
    );

    await runCoverageWorker(ports, {
      ...BASE_OPTIONS,
      maxTicks: 5,
      refreshBudgetFraction: 0.5,
      shouldContinue: () => !stop,
      shouldStop: () => stop,
    });

    expect(ports.reconciled).toEqual([{ search: 1, token: 1 }]);
    expect(ports.calls).not.toContain('runDedup');
    expect(ports.calls).not.toContain('nextPresenceBatches');
    expect(ports.calls).not.toContain('verifyPresence');
  });

  it('control: sin parada, el mismo escenario sí planifica la verificación de presencia', async () => {
    const ports = createFake({ selectNextJob: () => Promise.resolve({ ...JOB, lane: 'refresh' }) }, true);

    await runCoverageWorker(ports, { ...BASE_OPTIONS, refreshBudgetFraction: 0.5 });

    expect(ports.calls).toContain('nextPresenceBatches');
  });
});

describe('runCoverageWorker — gancho tras un tick correcto (latido, R6.5)', () => {
  it('se invoca una vez por tick correcto, con un presupuesto de salida de 4 plazas por defecto', async () => {
    const seen: number[] = [];
    const ports = createFake({
      onTickSuccess: (budget) => {
        seen.push(budget.remaining());
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 2 });

    expect(seen).toEqual([4, 4]);
  });

  it('el tope de llamadas salientes por tick es configurable y cada tick recibe un presupuesto NUEVO', async () => {
    const seen: number[] = [];
    const ports = createFake({
      onTickSuccess: (budget) => {
        seen.push(budget.remaining());
        budget.tryTake();
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 3, maxOutboundCallsPerTick: 2 });

    expect(seen).toEqual([2, 2, 2]);
  });

  it('se invoca después del dedup del tick', async () => {
    const ports = createFake({
      onTickSuccess: () => {
        ports.calls.push('onTickSuccess');
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls.indexOf('onTickSuccess')).toBeGreaterThan(ports.calls.indexOf('runDedup'));
  });

  it('un tick que lanza NO invoca el gancho (un tick fallido nunca emite latido)', async () => {
    let hookCalls = 0;
    const ports = createFake({
      selectNextJob: () => Promise.reject(new Error('db caída')),
      onTickSuccess: () => {
        hookCalls += 1;
        return Promise.resolve();
      },
    });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).rejects.toThrow('db caída');

    expect(hookCalls).toBe(0);
  });

  it('un gancho que lanza se registra y no aborta el worker (el siguiente tick se ejecuta)', async () => {
    const ports = createFake({
      onTickSuccess: () => Promise.reject(new Error('monitor caído')),
    });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxTicks: 2 });

    expect(ports.calls.filter((call) => call === 'selectNextJob')).toHaveLength(2);
    expect(ports.calls.some((call) => call.includes('paso "latido" falló: monitor caído'))).toBe(true);
  });
});

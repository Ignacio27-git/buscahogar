// ROADMAP 3.4 (decisión 259, D17) — el driver puro ofrece un paso OPCIONAL de avisos (`onAlertStep`): corre al
// final de cada tick que NO lanzó, aislado (una avería nunca rompe el tick ni el latido) y comparte con el
// latido el MISMO presupuesto de salida del tick (nuevo en cada tick). Puertos falsos: cero DB, cero red.
import { describe, expect, it } from 'vitest';

import type { LedgerState, ZoneGeometry } from '@buscahogar/db';

import type { OutboundBudget } from '../src/ops/outbound-budget.js';
import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions, CoverageWorkerPorts } from '../src/sweep/coverage-worker.js';
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

interface Hooks {
  readonly onAlertStep?: (budget: OutboundBudget) => Promise<void>;
  readonly onTickSuccess?: (budget: OutboundBudget) => Promise<void>;
  readonly failTick?: boolean;
}

function createPorts(hooks: Hooks): { ports: CoverageWorkerPorts; calls: string[]; logs: string[] } {
  const calls: string[] = [];
  const logs: string[] = [];
  const ports: CoverageWorkerPorts = {
    selectNextJob: () => {
      if (hooks.failTick) {
        return Promise.reject(new Error('base caída'));
      }
      return Promise.resolve(JOB);
    },
    resolveZoneGeometry: () => Promise.resolve(GEOMETRY),
    failJob: () => Promise.resolve(),
    reserveBudget: (): Promise<LedgerState | null> => Promise.resolve({ searchRequests: 10, tokenRequests: 1 }),
    reconcileBudget: () => Promise.resolve(),
    claimAndSweep: () => {
      calls.push('claimAndSweep');
      return Promise.resolve({ outcome: 'budget-exhausted', actual: { search: 1, token: 1 } });
    },
    runDedup: () => Promise.resolve(),
    purgeClientQuota: () => Promise.resolve(),
    sleep: () => Promise.resolve(),
    log: (line) => {
      logs.push(line);
    },
    ...(hooks.onAlertStep
      ? {
          onAlertStep: (budget: OutboundBudget): Promise<void> => {
            calls.push('onAlertStep');
            return hooks.onAlertStep?.(budget) ?? Promise.resolve();
          },
        }
      : {}),
    ...(hooks.onTickSuccess
      ? {
          onTickSuccess: (budget: OutboundBudget): Promise<void> => {
            calls.push('onTickSuccess');
            return hooks.onTickSuccess?.(budget) ?? Promise.resolve();
          },
        }
      : {}),
  };
  return { ports, calls, logs };
}

function options(overrides: Partial<CoverageWorkerOptions> = {}): CoverageWorkerOptions {
  return {
    pollIntervalMs: 10,
    maxSearchRequestsPerSweep: 10,
    dailySearchCap: 500,
    maxAttempts: 3,
    maxTicks: 2,
    ...overrides,
  };
}

describe('runCoverageWorker — paso de avisos (onAlertStep)', () => {
  it('corre tras el tick y ANTES del latido, en cada tick, con el mismo presupuesto que el latido', async () => {
    const seen: OutboundBudget[] = [];
    const { ports, calls } = createPorts({
      onAlertStep: (budget) => {
        seen.push(budget);
        return Promise.resolve();
      },
      onTickSuccess: (budget) => {
        seen.push(budget);
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, options());

    expect(calls.filter((call) => call !== 'claimAndSweep')).toEqual([
      'onAlertStep',
      'onTickSuccess',
      'onAlertStep',
      'onTickSuccess',
    ]);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[2]).toBe(seen[3]);
    expect(seen[0]).not.toBe(seen[2]);
  });

  it('lo que gasta el paso de avisos reduce lo que le queda al latido (presupuesto compartido)', async () => {
    const remaining: number[] = [];
    const { ports } = createPorts({
      onAlertStep: (budget) => {
        budget.tryTake();
        budget.tryTake();
        return Promise.resolve();
      },
      onTickSuccess: (budget) => {
        remaining.push(budget.remaining());
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, options({ maxTicks: 1, maxOutboundCallsPerTick: 4 }));

    expect(remaining).toEqual([2]);
  });

  it('funciona sin latido: el presupuesto se crea igualmente (por defecto 4 plazas)', async () => {
    const remaining: number[] = [];
    const { ports } = createPorts({
      onAlertStep: (budget) => {
        remaining.push(budget.remaining());
        return Promise.resolve();
      },
    });

    await runCoverageWorker(ports, options({ maxTicks: 1 }));

    expect(remaining).toEqual([4]);
  });

  it('un fallo del paso de avisos se registra, no rompe el tick y el latido corre igualmente', async () => {
    const { ports, calls, logs } = createPorts({
      onAlertStep: () => Promise.reject(new Error('Telegram caído')),
      onTickSuccess: () => Promise.resolve(),
    });

    await runCoverageWorker(ports, options({ maxTicks: 1 }));

    expect(calls).toContain('onTickSuccess');
    expect(logs.some((line) => line.includes('"avisos-operativos"') && line.includes('Telegram caído'))).toBe(true);
  });

  it('un tick que lanza no llega al paso de avisos (el supervisor se encarga de la caída)', async () => {
    const { ports, calls } = createPorts({ failTick: true, onAlertStep: () => Promise.resolve() });

    await expect(runCoverageWorker(ports, options())).rejects.toThrow('base caída');

    expect(calls).not.toContain('onAlertStep');
  });

  it('sin el puerto, el comportamiento anterior no cambia', async () => {
    const { ports, calls } = createPorts({});
    await runCoverageWorker(ports, options({ maxTicks: 1 }));
    expect(calls).toEqual(['claimAndSweep']);
  });
});

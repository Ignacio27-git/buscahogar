// ROADMAP 3.4 (decisión 258, parte 2; D14b) — el driver puro del worker recupera los jobs `running` abandonados
// al arrancar y en CADA tick, antes de elegir trabajo, aislado (una avería nunca aborta el tick) y con un
// evento estructurado más un gancho para la alerta del día (S6). Puertos falsos: cero DB, cero red, cero reloj.
import { describe, expect, it } from 'vitest';

import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { runCoverageWorker, staleReclaimAlertKey } from '../src/sweep/coverage-worker.js';
import type {
  CoverageWorkerOptions,
  CoverageWorkerPorts,
  StaleReclaimEvent,
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
const NOW = new Date('2026-10-22T23:59:30Z');
const OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
  now: () => NOW,
};

interface Hooks {
  readonly reclaim?: () => Promise<readonly string[]>;
  readonly onReclaimed?: (event: StaleReclaimEvent) => Promise<void>;
  readonly withoutReclaim?: boolean;
}

interface Fake extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly events: StaleReclaimEvent[];
}

function createFake(hooks: Hooks = {}): Fake {
  const calls: string[] = [];
  const events: StaleReclaimEvent[] = [];
  const onReclaimed = hooks.onReclaimed;
  return {
    calls,
    events,
    ...(hooks.withoutReclaim
      ? {}
      : {
          reclaimStaleJobs(): Promise<readonly string[]> {
            calls.push('reclaimStaleJobs');
            return hooks.reclaim ? hooks.reclaim() : Promise.resolve([]);
          },
        }),
    ...(onReclaimed
      ? {
          onStaleJobsReclaimed(event: StaleReclaimEvent): Promise<void> {
            calls.push('onStaleJobsReclaimed');
            events.push(event);
            return onReclaimed(event);
          },
        }
      : {}),
    selectNextJob(): Promise<PollJob | null> {
      calls.push('selectNextJob');
      return Promise.resolve(JOB);
    },
    resolveZoneGeometry: () => Promise.resolve(GEOMETRY),
    failJob: () => Promise.resolve(),
    reserveBudget(): Promise<LedgerState | null> {
      calls.push('reserveBudget');
      return Promise.resolve({ searchRequests: 10, tokenRequests: 1 });
    },
    reconcileBudget(_reserved: BudgetReservation, _actual: BudgetSnapshotLike): Promise<void> {
      calls.push('reconcileBudget');
      return Promise.resolve();
    },
    claimAndSweep(): Promise<SweepTickResult> {
      calls.push('claimAndSweep');
      return Promise.resolve({ outcome: 'budget-exhausted', actual: { search: 1, token: 1 } });
    },
    runDedup: () => Promise.resolve(),
    purgeClientQuota(): Promise<void> {
      calls.push('purgeClientQuota');
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    log(line: string): void {
      calls.push(`log:${line}`);
    },
  };
}

function logs(fake: Fake): string[] {
  return fake.calls.filter((call) => call.startsWith('log:')).map((call) => call.slice(4));
}

describe('staleReclaimAlertKey (D17)', () => {
  it('es `stale-reclaim:<día UTC>` y cambia con el día UTC, no con la zona horaria local', () => {
    expect(staleReclaimAlertKey(new Date('2026-10-22T23:59:59Z'))).toBe('stale-reclaim:2026-10-22');
    expect(staleReclaimAlertKey(new Date('2026-10-23T00:00:00Z'))).toBe('stale-reclaim:2026-10-23');
    expect(staleReclaimAlertKey(new Date('2026-01-05T08:00:00+05:00'))).toBe('stale-reclaim:2026-01-05');
  });
});

describe('recuperación de jobs running abandonados en el tick (D14b)', () => {
  it('corre en cada tick, tras purgar la cuota de cliente y ANTES de elegir trabajo', async () => {
    const fake = createFake();

    await runCoverageWorker(fake, { ...OPTIONS, maxTicks: 3 });

    const reclaimIndexes = fake.calls.flatMap((call, index) => (call === 'reclaimStaleJobs' ? [index] : []));
    const selectIndexes = fake.calls.flatMap((call, index) => (call === 'selectNextJob' ? [index] : []));
    expect(reclaimIndexes).toHaveLength(3);
    expect(selectIndexes).toHaveLength(3);
    for (let tick = 0; tick < 3; tick += 1) {
      expect(reclaimIndexes[tick]).toBeLessThan(selectIndexes[tick] ?? -1);
    }
    expect(fake.calls.indexOf('purgeClientQuota')).toBeLessThan(fake.calls.indexOf('reclaimStaleJobs'));
    // El primer tick es el arranque: la recuperación precede a toda selección desde el primer momento.
    expect(fake.calls.indexOf('reclaimStaleJobs')).toBeLessThan(fake.calls.indexOf('selectNextJob'));
  });

  it('con jobs reclamados: un evento estructurado en el registro y el gancho con la clave de alerta del día UTC', async () => {
    const fake = createFake({
      reclaim: () => Promise.resolve(['job-a', 'job-b']),
      onReclaimed: () => Promise.resolve(),
    });

    await runCoverageWorker(fake, OPTIONS);

    const eventLines = logs(fake).filter((line) => line.includes('stale-running-reclaimed'));
    expect(eventLines).toHaveLength(1);
    expect(eventLines[0]).toContain('count=2');
    expect(eventLines[0]).toContain('job_ids=job-a,job-b');
    expect(eventLines[0]).toContain('alert_key=stale-reclaim:2026-10-22');
    expect(fake.events).toEqual([{ jobIds: ['job-a', 'job-b'], alertKey: 'stale-reclaim:2026-10-22' }]);
  });

  it('sin jobs reclamados no hay evento ni gancho (el caso normal no hace ruido)', async () => {
    const fake = createFake({ reclaim: () => Promise.resolve([]), onReclaimed: () => Promise.resolve() });

    await runCoverageWorker(fake, OPTIONS);

    expect(logs(fake).filter((line) => line.includes('stale-running-reclaimed'))).toEqual([]);
    expect(fake.events).toEqual([]);
    expect(fake.calls).toContain('claimAndSweep');
  });

  it('si la recuperación lanza: se registra el paso, el gancho no corre y el tick sigue hasta barrer', async () => {
    const fake = createFake({
      reclaim: () => Promise.reject(new Error('conexión perdida')),
      onReclaimed: () => Promise.resolve(),
    });

    await runCoverageWorker(fake, OPTIONS);

    expect(logs(fake)).toContainEqual(
      expect.stringContaining('paso "recuperacion-de-jobs-atascados" falló: conexión perdida')
    );
    expect(fake.events).toEqual([]);
    expect(fake.calls).toContain('selectNextJob');
    expect(fake.calls).toContain('claimAndSweep');
  });

  it('si el gancho lanza: se registra, y el tick sigue (el evento ya se había registrado)', async () => {
    const fake = createFake({
      reclaim: () => Promise.resolve(['job-a']),
      onReclaimed: () => Promise.reject(new Error('telegram caído')),
    });

    await runCoverageWorker(fake, OPTIONS);

    const lines = logs(fake);
    expect(lines.filter((line) => line.includes('stale-running-reclaimed') && line.includes('count=1'))).toHaveLength(1);
    expect(lines).toContainEqual(expect.stringContaining('paso "alerta-de-jobs-atascados" falló: telegram caído'));
    expect(fake.calls).toContain('claimAndSweep');
  });

  it('con jobs reclamados pero sin gancho (composición sin alertas) solo se registra el evento', async () => {
    const fake = createFake({ reclaim: () => Promise.resolve(['job-a']) });

    await runCoverageWorker(fake, OPTIONS);

    expect(logs(fake).filter((line) => line.includes('stale-running-reclaimed'))).toHaveLength(1);
    expect(fake.calls).toContain('claimAndSweep');
  });

  it('sin el puerto (composiciones anteriores) el tick es el de siempre', async () => {
    const fake = createFake({ withoutReclaim: true });

    await runCoverageWorker(fake, OPTIONS);

    expect(fake.calls).not.toContain('reclaimStaleJobs');
    expect(fake.calls).toContain('claimAndSweep');
  });
});

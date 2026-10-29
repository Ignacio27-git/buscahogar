// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105/110) — el driver puro
// del worker con la verificación de presencia: nominación de ausentes tras un
// ciclo COMPLETADO (S-CWT-11), paso de verificación aislado que solo corre sin
// trabajo a demanda y con fracción > 0 (S-LR-13..15, S-CWT-3, 7, 9), tope de
// peticiones por tick y reserva por el carril de refresco. Puertos falsos que
// anotan sus llamadas: cero DB, cero red, cero process.env.
import { describe, expect, it } from 'vitest';

import type { AreaQuery, PartitionedPresence, PresenceBatch, PresenceVerdict } from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type {
  CoverageWorkerOptions,
  CoverageWorkerPorts,
  PresencePlan,
  PresenceVerification,
  PresenceVerificationPorts,
  SweepTickResult,
} from '../src/sweep/coverage-worker.js';
import type { JobLane, PollJob } from '../src/sweep/job-selection.js';

const GEOMETRY: ZoneGeometry = {
  zoneId: 'zone-1',
  ineCode: '18087',
  municipality: 'Granada',
  state: 'covered',
  centroid: { latitude: 40.43, longitude: -3.702 },
  sweepRadiusM: 4500,
};

const ON_DEMAND_JOB: PollJob = {
  jobId: 'job-1',
  zoneId: 'zone-1',
  sourceId: 'source-1',
  operation: 'sale',
  lane: 'on-demand',
};
const REFRESH_JOB: PollJob = {
  jobId: 'job-2',
  zoneId: 'zone-2',
  sourceId: 'source-1',
  operation: 'sale',
  lane: 'refresh',
};

const BASE_OPTIONS: CoverageWorkerOptions = {
  pollIntervalMs: 10,
  maxSearchRequestsPerSweep: 10,
  dailySearchCap: 500,
  maxAttempts: 3,
  maxTicks: 1,
  refreshBudgetFraction: 0.2,
  maxVerificationRequestsPerTick: 3,
};

function batch(id: string, groupKey = 'homes'): PresenceBatch {
  return {
    center: { latitude: 40.43, longitude: -3.702 },
    radiusMeters: 4500,
    operation: 'sale',
    groupKey,
    externalIds: [`${id}-a`, `${id}-b`],
  };
}

function planOf(batches: readonly PresenceBatch[], unverifiable: readonly string[] = []): PresencePlan {
  const listingIdByExternalId = new Map<string, string>();
  for (const item of batches) {
    for (const externalId of item.externalIds) {
      listingIdByExternalId.set(externalId, `listing-of-${externalId}`);
    }
  }
  return { batches, listingIdByExternalId, unverifiableListingIds: unverifiable };
}

interface Overrides {
  readonly job?: PollJob | null;
  readonly plan?: PresencePlan;
  readonly claimAndSweep?: () => Promise<SweepTickResult>;
  readonly markAbsence?: () => Promise<number>;
  readonly nextBatches?: (max: number) => Promise<PresencePlan>;
  readonly verify?: (batches: readonly PresenceBatch[]) => Promise<PresenceVerification>;
  readonly apply?: () => Promise<void>;
  readonly reserveBudget?: () => Promise<LedgerState | null>;
  readonly withVerification?: boolean;
}

interface Fake extends CoverageWorkerPorts {
  readonly calls: string[];
  readonly logged: string[];
  readonly reserveCalls: (readonly [BudgetReservation, JobLane])[];
  readonly reconciled: (readonly [BudgetReservation, BudgetSnapshotLike])[];
  readonly marked: (readonly [PollJob, AreaQuery])[];
  readonly requestedMax: number[];
  readonly verified: (readonly PresenceBatch[])[];
  readonly applied: PartitionedPresence[];
}

function createFake(overrides: Overrides = {}): Fake {
  const calls: string[] = [];
  const logged: string[] = [];
  const reserveCalls: (readonly [BudgetReservation, JobLane])[] = [];
  const reconciled: (readonly [BudgetReservation, BudgetSnapshotLike])[] = [];
  const marked: (readonly [PollJob, AreaQuery])[] = [];
  const requestedMax: number[] = [];
  const verified: (readonly PresenceBatch[])[] = [];
  const applied: PartitionedPresence[] = [];
  const job = overrides.job === undefined ? REFRESH_JOB : overrides.job;
  const defaultPlan = overrides.plan ?? planOf([batch('x')]);

  const verification: PresenceVerificationPorts = {
    markAbsenceCandidates(markedJob: PollJob, area: AreaQuery): Promise<number> {
      calls.push('markAbsenceCandidates');
      marked.push([markedJob, area]);
      return overrides.markAbsence ? overrides.markAbsence() : Promise.resolve(2);
    },
    nextPresenceBatches(max: number): Promise<PresencePlan> {
      calls.push('nextPresenceBatches');
      requestedMax.push(max);
      return overrides.nextBatches ? overrides.nextBatches(max) : Promise.resolve(defaultPlan);
    },
    verifyPresence(batches: readonly PresenceBatch[]): Promise<PresenceVerification> {
      calls.push('verifyPresence');
      verified.push(batches);
      if (overrides.verify) {
        return overrides.verify(batches);
      }
      const verdicts = new Map<string, PresenceVerdict>(
        batches.flatMap((item) => item.externalIds.map((id): [string, PresenceVerdict] => [id, 'present']))
      );
      return Promise.resolve({ verdicts, actual: { search: batches.length, token: 1 } });
    },
    applyPresence(result: PartitionedPresence): Promise<void> {
      calls.push('applyPresence');
      applied.push(result);
      return overrides.apply ? overrides.apply() : Promise.resolve();
    },
  };

  return {
    calls,
    logged,
    reserveCalls,
    reconciled,
    marked,
    requestedMax,
    verified,
    applied,
    ...(overrides.withVerification === false ? {} : { verification }),
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
    reconcileBudget(reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void> {
      calls.push('reconcileBudget');
      reconciled.push([reserved, actual]);
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

describe('runCoverageWorker — nominación de ausentes tras un ciclo completado (S-CWT-11)', () => {
  it('tras un barrido COMPLETADO llama a markAbsenceCandidates con el job y el área barrida, después de reconciliar el presupuesto', async () => {
    const ports = createFake({ job: ON_DEMAND_JOB });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.marked).toHaveLength(1);
    const [markedJob, area] = ports.marked[0] ?? [];
    expect(markedJob).toEqual(ON_DEMAND_JOB);
    expect(area).toMatchObject({ operation: 'sale', radiusMeters: 4500, center: { latitude: 40.43, longitude: -3.702 } });
    const order = ports.calls.filter((call) => ['claimAndSweep', 'reconcileBudget', 'markAbsenceCandidates', 'runDedup'].includes(call));
    expect(order).toEqual(['claimAndSweep', 'reconcileBudget', 'markAbsenceCandidates', 'runDedup']);
  });

  it.each(['budget-exhausted', 'failed'] as const)(
    'S-LR-2: un barrido con desenlace "%s" (ciclo incompleto) NO nomina a nadie',
    async (outcome) => {
      const ports = createFake({
        job: ON_DEMAND_JOB,
        claimAndSweep: () => Promise.resolve({ outcome, actual: { search: 3, token: 1 } }),
      });

      await runCoverageWorker(ports, BASE_OPTIONS);

      expect(ports.calls).not.toContain('markAbsenceCandidates');
    }
  );

  it('un fallo al nominar se aísla: el tick termina, lo registra y el tick sigue sucio (runDedup)', async () => {
    const ports = createFake({ job: ON_DEMAND_JOB, markAbsence: () => Promise.reject(new Error('fallo de nominación')) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.logged.join('\n')).toContain('paso "nominacion-de-ausentes" falló: fallo de nominación');
    expect(ports.calls).toContain('runDedup');
  });

  it('sin el grupo de verificación (composiciones anteriores a S3) el barrido completado sigue funcionando (S-CWT-12)', async () => {
    const ports = createFake({ job: ON_DEMAND_JOB, withVerification: false });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).toContain('runDedup');
    expect(ports.calls).not.toContain('nextPresenceBatches');
  });
});

describe('runCoverageWorker — paso de verificación (S-LR-15, S-CWT-9)', () => {
  it('sin trabajo pendiente verifica: reserva por el carril de refresco (búsquedas = lotes, token 1), envía, reconcilia y aplica', async () => {
    const ports = createFake({ job: null, plan: planOf([batch('x'), batch('y')]) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.reserveCalls).toEqual([[{ searchReserved: 2, tokenReserved: 1 }, 'refresh']]);
    expect(ports.verified).toHaveLength(1);
    expect(ports.verified[0]?.map((item) => item.externalIds)).toEqual([
      ['x-a', 'x-b'],
      ['y-a', 'y-b'],
    ]);
    expect(ports.reconciled).toEqual([[{ searchReserved: 2, tokenReserved: 1 }, { search: 2, token: 1 }]]);
    expect(ports.applied).toEqual([
      {
        present: ['listing-of-x-a', 'listing-of-x-b', 'listing-of-y-a', 'listing-of-y-b'],
        absent: [],
        ambiguous: [],
      },
    ]);
    const order = ports.calls.filter((call) =>
      ['nextPresenceBatches', 'reserveBudget', 'verifyPresence', 'reconcileBudget', 'applyPresence'].includes(call)
    );
    expect(order).toEqual(['nextPresenceBatches', 'reserveBudget', 'verifyPresence', 'reconcileBudget', 'applyPresence']);
  });

  it('también verifica tras procesar un job de REFRESCO (no es trabajo a demanda)', async () => {
    const ports = createFake({ job: REFRESH_JOB });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).toContain('verifyPresence');
  });

  it('S-LR-15 / S-CWT-9: con un job A DEMANDA en el tick la verificación se omite por completo', async () => {
    const ports = createFake({ job: ON_DEMAND_JOB });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).not.toContain('nextPresenceBatches');
    expect(ports.calls).not.toContain('verifyPresence');
  });

  it('un job a demanda sin presupuesto (tick ocioso) tampoco deja verificar: la demanda manda', async () => {
    const ports = createFake({ job: ON_DEMAND_JOB, reserveBudget: () => Promise.resolve(null) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).not.toContain('nextPresenceBatches');
  });

  it.each([0, undefined])('con refreshBudgetFraction = %s la verificación no corre (no hay techo de gasto)', async (fraction) => {
    const ports = createFake({ job: null });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, refreshBudgetFraction: fraction });

    expect(ports.calls).not.toContain('nextPresenceBatches');
    expect(ports.calls).not.toContain('verifyPresence');
  });

  it('S-LR-14: pide como mucho maxVerificationRequestsPerTick lotes y recorta un plan más largo', async () => {
    const batches = ['a', 'b', 'c', 'd', 'e'].map((id) => batch(id));
    const ports = createFake({ job: null, plan: planOf(batches) });

    await runCoverageWorker(ports, { ...BASE_OPTIONS, maxVerificationRequestsPerTick: 2 });

    expect(ports.requestedMax).toEqual([2]);
    expect(ports.verified[0]).toHaveLength(2);
    expect(ports.reserveCalls[0]?.[0]).toEqual({ searchReserved: 2, tokenReserved: 1 });
    // Los ids de los lotes recortados NO se tocan: siguen vencidos para el próximo tick.
    const touched = ports.applied.flatMap((item) => [...item.present, ...item.absent, ...item.ambiguous]);
    expect(touched.sort()).toEqual(['listing-of-a-a', 'listing-of-a-b', 'listing-of-b-a', 'listing-of-b-b']);
  });

  it('usa un tope por defecto explícito cuando las opciones no lo fijan', async () => {
    const ports = createFake({ job: null, plan: planOf([batch('a')]) });
    const withoutCap: CoverageWorkerOptions = {
      pollIntervalMs: 10,
      maxSearchRequestsPerSweep: 10,
      dailySearchCap: 500,
      maxAttempts: 3,
      maxTicks: 1,
      refreshBudgetFraction: 0.2,
    };

    await runCoverageWorker(ports, withoutCap);

    expect(ports.requestedMax).toHaveLength(1);
    expect(ports.requestedMax[0]).toBeGreaterThan(0);
    expect(ports.requestedMax[0]).toBeLessThanOrEqual(5);
  });

  it('S-LR-13: si el ledger deniega la reserva no hay llamada ni cambio alguno', async () => {
    const ports = createFake({ job: null, reserveBudget: () => Promise.resolve(null) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('reserveBudget');
    expect(ports.calls).not.toContain('verifyPresence');
    expect(ports.calls).not.toContain('reconcileBudget');
    expect(ports.calls).not.toContain('applyPresence');
    expect(ports.logged.join('\n')).toContain('presupuesto');
  });

  it('sin lotes que enviar no se reserva presupuesto ni se llama a la fuente', async () => {
    const ports = createFake({ job: null, plan: planOf([]) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.calls).toContain('nextPresenceBatches');
    expect(ports.calls).not.toContain('reserveBudget');
    expect(ports.calls).not.toContain('verifyPresence');
  });

  it('S-LR-11: los ids sin filtro de la fuente se marcan ambiguos SIN reservar presupuesto ni enviar petición', async () => {
    const ports = createFake({ job: null, plan: planOf([], ['listing-sin-mapa-1', 'listing-sin-mapa-2']) });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.applied).toEqual([
      { present: [], absent: [], ambiguous: ['listing-sin-mapa-1', 'listing-sin-mapa-2'] },
    ]);
    expect(ports.calls).not.toContain('reserveBudget');
    expect(ports.calls).not.toContain('verifyPresence');
  });

  it('un veredicto ausente y uno ambiguo se reparten por id de listing; un id sin veredicto queda ambiguo', async () => {
    const ports = createFake({
      job: null,
      plan: planOf([batch('x')]),
      verify: () =>
        Promise.resolve({
          verdicts: new Map<string, PresenceVerdict>([['x-a', 'absent']]),
          actual: { search: 1, token: 1 },
        }),
    });

    await runCoverageWorker(ports, BASE_OPTIONS);

    expect(ports.applied).toEqual([{ present: [], absent: ['listing-of-x-a'], ambiguous: ['listing-of-x-b'] }]);
  });
});

describe('runCoverageWorker — aislamiento del paso de verificación (S-CWT-3)', () => {
  it('si la verificación lanza, el tick termina con normalidad, registra el paso y conserva la reserva (no reconcilia)', async () => {
    const ports = createFake({ job: null, verify: () => Promise.reject(new Error('fallo inesperado')) });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.logged.join('\n')).toContain('paso "verificacion-de-presencia" falló: fallo inesperado');
    expect(ports.calls).not.toContain('reconcileBudget');
    expect(ports.calls).not.toContain('applyPresence');
  });

  it('si aplicar los veredictos lanza, el presupuesto ya se reconcilió con lo realmente gastado', async () => {
    const ports = createFake({ job: null, apply: () => Promise.reject(new Error('fallo de escritura')) });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.calls).toContain('reconcileBudget');
    expect(ports.logged.join('\n')).toContain('paso "verificacion-de-presencia" falló: fallo de escritura');
  });

  it('un fallo al planificar los lotes no aborta el tick ni el barrido previo', async () => {
    const ports = createFake({ job: REFRESH_JOB, nextBatches: () => Promise.reject(new Error('fallo de lectura')) });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).resolves.toBeUndefined();

    expect(ports.calls).toContain('claimAndSweep');
    expect(ports.calls).toContain('runDedup');
    expect(ports.logged.join('\n')).toContain('paso "verificacion-de-presencia" falló: fallo de lectura');
  });

  it('un error del barrido sigue propagándose (semántica de 1.13 intacta) y no llega a verificar', async () => {
    const ports = createFake({ job: REFRESH_JOB, claimAndSweep: () => Promise.reject(new Error('boom del barrido')) });

    await expect(runCoverageWorker(ports, BASE_OPTIONS)).rejects.toThrow('boom del barrido');

    expect(ports.calls).not.toContain('nextPresenceBatches');
  });
});

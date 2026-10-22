// Paso 1.7 — sweep-runner.ts (CLI-2, CLI-3, CLI-5, diseño D1/D6): el driver
// del barrido probado enteramente contra un PropertySource falso y un
// SweepStore falso — cero red, cero base de datos. Usa el normalizador REAL
// de 1.6 (IdealistaListingNormalizer), ya puro y ya testeado por separado.
import { describe, expect, it } from 'vitest';

import type { AreaQuery, PropertySource, SourcePage } from '@buscahogar/core';

import { IdealistaListingNormalizer } from '../src/sources/idealista/normalizer.js';
import {
  InvalidCursorError,
  SweepBudgetExhaustedError,
  SweepTransportError,
  UntrustworthyEnvelopeError,
} from '../src/sources/idealista/errors.js';
import type { IdealistaElement } from '../src/sources/idealista/raw-element.schema.js';
import { runSweep } from '../src/sweep/sweep-runner.js';
import type { ClaimedJob, JobOutcome, PersistPageInput, PersistPageOutcome, SweepStore } from '../src/sweep/store.js';

const AREA: AreaQuery = { center: { latitude: 40.43, longitude: -3.702 }, radiusMeters: 500, operation: 'sale' };

function fakeRawElement(propertyCode: number, overrides: Partial<IdealistaElement> = {}): IdealistaElement {
  return {
    propertyCode,
    price: 100000,
    propertyType: 'flat',
    operation: 'sale',
    url: `https://example.test/${String(propertyCode)}`,
    address: 'calle falsa 1',
    latitude: 40.4,
    longitude: -3.7,
    ...overrides,
  };
}

type ScriptStep = SourcePage<IdealistaElement> | (() => never);

function createScriptedSource(script: readonly ScriptStep[]): PropertySource<IdealistaElement> & {
  readonly calls: () => number;
} {
  let index = 0;
  let calls = 0;
  return {
    id: 'fake',
    calls: () => calls,
    fetchArea(): Promise<SourcePage<IdealistaElement>> {
      const step = script[index];
      index += 1;
      calls += 1;
      if (step === undefined) {
        throw new Error('script del fake source agotado: el runner pidió más páginas de las esperadas.');
      }
      if (typeof step === 'function') {
        return Promise.resolve(step());
      }
      return Promise.resolve(step);
    },
  };
}

function createFakeStore(): SweepStore & {
  readonly persistCalls: PersistPageInput[];
  readonly finishCalls: readonly (readonly [string, JobOutcome])[];
} {
  const persistCalls: PersistPageInput[] = [];
  const finishCalls: (readonly [string, JobOutcome])[] = [];
  return {
    persistCalls,
    finishCalls,
    persistPage(input: PersistPageInput): Promise<PersistPageOutcome> {
      persistCalls.push(input);
      return Promise.resolve({ inserted: input.items.length, versioned: 0, unchanged: 0 });
    },
    claimJob(): Promise<ClaimedJob> {
      // sweep-runner NO debe llamar a claimJob — lo hace el compositor
      // (fase 4) antes de invocar el driver (COVERAGE-3a, nota de
      // ordenación 3 del checklist).
      throw new Error('sweep-runner no debe llamar a store.claimJob().');
    },
    finishJob(jobId: string, outcome: JobOutcome): Promise<void> {
      finishCalls.push([jobId, outcome]);
      return Promise.resolve();
    },
  };
}

const normalizer = new IdealistaListingNormalizer();

describe('runSweep — CLI-3a: una página vacía con nextCursor presente NO detiene el barrido', () => {
  it('continúa al siguiente cursor en vez de tratarlo como fin del barrido', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([{ items: [], nextCursor: 'offices:1' }, { items: [fakeRawElement(1)] }]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({
      source,
      normalizer,
      store,
      area: AREA,
      job,
      sourceUuid: 'source-uuid',
      fingerprint: 'fp-1',
    });

    expect(source.calls()).toBe(2);
    expect(result.outcome).toBe('completed');
    expect(store.persistCalls).toHaveLength(2);
  });
});

describe('runSweep — CLI-2a: el tope de peticiones detiene el barrido sin corromper páginas ya persistidas', () => {
  it('las páginas persistidas antes del tope quedan intactas y el resultado es budget-exhausted', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      { items: [fakeRawElement(1)], nextCursor: 'homes:2' },
      { items: [fakeRawElement(2)], nextCursor: 'homes:3' },
      (): never => {
        throw new SweepBudgetExhaustedError('homes:3', { search: 2, token: 1 });
      },
    ]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('budget-exhausted');
    expect(result.resumeCursor).toBe('homes:3');
    expect(store.persistCalls).toHaveLength(2);
    expect(store.persistCalls[0]?.items).toHaveLength(1);
    expect(store.persistCalls[1]?.items).toHaveLength(1);
    expect(store.finishCalls).toEqual([['job-1', { kind: 'budget-exhausted', resumeCursor: 'homes:3' }]]);
  });
});

describe('runSweep — CLI-5a: un elemento inválido no aborta la página', () => {
  it('salta y cuenta el elemento #12 (price:0), procesa los otros 49, sin que escape ninguna excepción', async () => {
    const store = createFakeStore();
    const elements = Array.from({ length: 50 }, (_, index) =>
      index === 11 ? fakeRawElement(12, { price: 0 }) : fakeRawElement(index + 1)
    );
    const source = createScriptedSource([{ items: elements }]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('completed');
    expect(result.rejectedCount).toBe(1);
    expect(store.persistCalls[0]?.items).toHaveLength(49);
  });
});

describe('runSweep — enrutado exacto de errores a store.finishJob (diseño D6)', () => {
  it('SweepTransportError: finishJob("transport-failed") y outcome "failed"', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      (): never => {
        throw new SweepTransportError('http-error', 'homes:1', 'observación ya scrubeada', 502);
      },
    ]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('failed');
    expect(result.resumeCursor).toBe('homes:1');
    expect(store.finishCalls).toEqual([
      ['job-1', { kind: 'transport-failed', resumeCursor: 'homes:1', error: 'observación ya scrubeada' }],
    ]);
  });

  it('UntrustworthyEnvelopeError: finishJob("untrustworthy-envelope") y outcome "failed"', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      (): never => {
        throw new UntrustworthyEnvelopeError('totalPages', 'not-a-number', 'homes:1');
      },
    ]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('failed');
    expect(result.resumeCursor).toBe('homes:1');
    expect(store.finishCalls).toHaveLength(1);
    expect(store.finishCalls[0]?.[1].kind).toBe('untrustworthy-envelope');
  });

  it('InvalidCursorError: finishJob("invalid-cursor") sin resumeCursor, y outcome "failed"', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      (): never => {
        throw new InvalidCursorError('homes:x', 'número de página inválido.');
      },
    ]);
    const job: ClaimedJob = { id: 'job-1', cursor: 'homes:x' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('failed');
    expect(store.finishCalls).toEqual([['job-1', { kind: 'invalid-cursor', error: 'número de página inválido.' }]]);
  });

  it('un barrido completo llama a finishJob({kind:"completed"}) exactamente una vez', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([{ items: [fakeRawElement(1)] }]);
    const job: ClaimedJob = { id: 'job-1' };

    const result = await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(result.outcome).toBe('completed');
    expect(store.finishCalls).toEqual([['job-1', { kind: 'completed' }]]);
  });
});

describe('runSweep — arranca desde job.cursor cuando el trabajo reclamado trae uno', () => {
  it('pasa job.cursor tal cual a la primera llamada de source.fetchArea', async () => {
    const store = createFakeStore();
    let receivedCursor: string | undefined;
    const source: PropertySource<IdealistaElement> = {
      id: 'fake',
      fetchArea(_area: AreaQuery, cursor?: string): Promise<SourcePage<IdealistaElement>> {
        receivedCursor = cursor;
        return Promise.resolve({ items: [] });
      },
    };
    const job: ClaimedJob = { id: 'job-1', cursor: 'premises:3' };

    await runSweep({ source, normalizer, store, area: AREA, job, sourceUuid: 'src', fingerprint: 'fp' });

    expect(receivedCursor).toBe('premises:3');
  });
});

// ROADMAP 3.4 (decisión 258, D14; R6.2) — parada ordenada: con una parada pedida el barrido termina en el
// LÍMITE DE PÁGINA con el desenlace `budget-exhausted` que ya existe (el job vuelve a `pending` con el cursor
// confirmado y el presupuesto se reconcilia con lo gastado). Nunca se interrumpe una página a medias.
describe('runSweep — shouldStop (parada en el límite de página)', () => {
  it('con la parada pedida tras la primera página persiste esa página, no pide más y termina budget-exhausted con el cursor siguiente', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      { items: [fakeRawElement(1)], nextCursor: 'homes:2' },
      { items: [fakeRawElement(2)], nextCursor: 'homes:3' },
      { items: [fakeRawElement(3)] },
    ]);
    let stop = false;
    // La señal llega mientras se pide la primera página (a mitad del barrido).
    const stopAfterFirstFetch = (): boolean => {
      stop = source.calls() >= 1;
      return stop;
    };

    const result = await runSweep({
      source,
      normalizer,
      store,
      area: AREA,
      job: { id: 'job-1' },
      sourceUuid: 'src',
      fingerprint: 'fp',
      shouldStop: stopAfterFirstFetch,
    });

    expect(stop).toBe(true);
    expect(result.outcome).toBe('budget-exhausted');
    expect(result.resumeCursor).toBe('homes:2');
    expect(source.calls()).toBe(1);
    expect(store.persistCalls).toHaveLength(1);
    expect(store.persistCalls[0]?.nextCursor).toBe('homes:2');
    expect(store.finishCalls).toEqual([['job-1', { kind: 'budget-exhausted', resumeCursor: 'homes:2' }]]);
  });

  it('la parada se comprueba DESPUÉS de persistir: una página nunca queda a medias', async () => {
    const store = createFakeStore();
    const order: string[] = [];
    const source = createScriptedSource([{ items: [fakeRawElement(1)], nextCursor: 'homes:2' }]);
    const persist = store.persistPage.bind(store);
    store.persistPage = async (input: PersistPageInput): Promise<PersistPageOutcome> => {
      order.push('persist');
      return persist(input);
    };

    await runSweep({
      source,
      normalizer,
      store,
      area: AREA,
      job: { id: 'job-1' },
      sourceUuid: 'src',
      fingerprint: 'fp',
      shouldStop: () => {
        order.push('check');
        return true;
      },
    });

    expect(order).toEqual(['persist', 'check']);
  });

  it('una parada pedida durante la ÚLTIMA página no la degrada: el barrido se completa', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([{ items: [fakeRawElement(1)] }]);

    const result = await runSweep({
      source,
      normalizer,
      store,
      area: AREA,
      job: { id: 'job-1' },
      sourceUuid: 'src',
      fingerprint: 'fp',
      shouldStop: () => true,
    });

    expect(result.outcome).toBe('completed');
    expect(store.finishCalls).toEqual([['job-1', { kind: 'completed' }]]);
  });

  it('sin parada pedida se comporta exactamente como antes (3 páginas, completed)', async () => {
    const store = createFakeStore();
    const source = createScriptedSource([
      { items: [fakeRawElement(1)], nextCursor: 'homes:2' },
      { items: [fakeRawElement(2)], nextCursor: 'homes:3' },
      { items: [fakeRawElement(3)] },
    ]);

    const result = await runSweep({
      source,
      normalizer,
      store,
      area: AREA,
      job: { id: 'job-1' },
      sourceUuid: 'src',
      fingerprint: 'fp',
      shouldStop: () => false,
    });

    expect(result.outcome).toBe('completed');
    expect(source.calls()).toBe(3);
    expect(store.persistCalls).toHaveLength(3);
  });
});

// ROADMAP 3.3 (decisión 253; R3, R4, R5; D13; S3.2, S4.1-S4.4, S5.1, S5.2) — bucle de ejecución del presweep,
// probado con PUERTOS FALSOS (cero red, cero base de datos). El registro mensual falso aplica la MISMA regla de
// concesión que el SQL (`monthlyGrant` de packages/core, concesión parcial del batch); el conector falso reparte
// cada unidad en «páginas» persistentes (el cursor), así que se comprueba qué páginas se piden y que una
// reanudación no repite ninguna. El bucle real contra PostgreSQL y el conector de Idealista falso está en
// `test/db/presweep-run.db.test.ts`.
import { laneRemaining, monthlyGrant } from '@buscahogar/core';
import type { MonthlyLedgerState } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import { presweepExitCode, runPresweep } from '../src/presweep/run-presweep.js';
import type {
  PresweepArgsLike,
  PresweepCandidate,
  PresweepPorts,
  PresweepReservation,
  UnitSweepResult,
} from '../src/presweep/run-presweep.js';

interface FakeUnitSpec {
  // Peticiones que necesita la unidad desde cero (por ejemplo 36 páginas).
  readonly pages: number;
  // Si se fija, la unidad falla tras `failAfter` peticiones con señal de la fuente.
  readonly failAfter?: number;
  // El reclamo falla (otro proceso la tiene): cero peticiones, reserva devuelta.
  readonly notClaimed?: boolean;
}

interface World {
  readonly ports: PresweepPorts;
  readonly state: {
    ledger: MonthlyLedgerState | null;
    reserveCalls: number[];
    sweepCalls: { readonly key: string; readonly hardCap: number }[];
    listCalls: number;
    logged: string[];
    // Siguiente página por unidad (persistente entre ejecuciones: es el cursor).
    nextPage: Map<string, number>;
    requestedPages: Map<string, number[]>;
    // Antes de la reserva N, otro proceso gasta `rival` peticiones (concesión parcial inesperada).
    rivalSpendBeforeReserve: number;
  };
}

const CITIES: readonly PresweepCandidate[] = [
  { id: '28079', municipality: 'Madrid', population: 3_300_000, units: { sale: 'pending', rent: 'pending' } },
  { id: '08019', municipality: 'Barcelona', population: 1_600_000, units: { sale: 'pending', rent: 'pending' } },
  { id: '41091', municipality: 'Sevilla', population: 680_000, units: { sale: 'pending', rent: 'pending' } },
];

function key(cityId: string, operation: string): string {
  return `${cityId}:${operation}`;
}

function createWorld(options: {
  readonly ledger: MonthlyLedgerState | null;
  readonly candidates?: readonly PresweepCandidate[];
  readonly units?: Readonly<Record<string, FakeUnitSpec>>;
  readonly rivalSpendBeforeReserve?: number;
}): World {
  const state: World['state'] = {
    ledger: options.ledger,
    reserveCalls: [],
    sweepCalls: [],
    listCalls: 0,
    logged: [],
    nextPage: new Map(),
    requestedPages: new Map(),
    rivalSpendBeforeReserve: options.rivalSpendBeforeReserve ?? 0,
  };
  const candidates = options.candidates ?? CITIES;
  const specs = options.units ?? {};

  const ports: PresweepPorts = {
    readLedger(): Promise<MonthlyLedgerState | null> {
      return Promise.resolve(state.ledger === null ? null : { ...state.ledger });
    },
    listCandidates(): Promise<readonly PresweepCandidate[]> {
      state.listCalls += 1;
      return Promise.resolve(candidates);
    },
    reserve(requested: number): Promise<PresweepReservation> {
      state.reserveCalls.push(requested);
      const ledger = state.ledger;
      if (ledger === null) {
        return Promise.resolve({ granted: false, reason: 'monthly-missing' });
      }
      if (state.rivalSpendBeforeReserve > 0) {
        state.ledger = { ...ledger, searchRequests: ledger.searchRequests + state.rivalSpendBeforeReserve };
        state.rivalSpendBeforeReserve = 0;
      }
      const current = state.ledger ?? ledger;
      const grant = monthlyGrant('batch', requested, current);
      if (grant <= 0) {
        return Promise.resolve({ granted: false, reason: 'monthly' });
      }
      state.ledger = { ...current, searchRequests: current.searchRequests + grant };
      return Promise.resolve({
        granted: true,
        searchGranted: grant,
        settle(actual): Promise<void> {
          const after = state.ledger;
          if (after !== null) {
            state.ledger = { ...after, searchRequests: after.searchRequests - Math.max(0, grant - actual.search) };
          }
          return Promise.resolve();
        },
      });
    },
    sweepUnit(unit, hardCap): Promise<UnitSweepResult> {
      const unitKey = key(unit.cityId, unit.operation);
      state.sweepCalls.push({ key: unitKey, hardCap });
      const spec = specs[unitKey] ?? { pages: 1 };
      if (spec.notClaimed === true) {
        return Promise.resolve({ kind: 'not-claimed', reason: 'ya reclamada por otro proceso' });
      }
      const start = state.nextPage.get(unitKey) ?? 1;
      const remaining = spec.pages - (start - 1);
      const failAfter = spec.failAfter;
      const emitted = Math.min(remaining, hardCap, failAfter ?? Number.POSITIVE_INFINITY);
      const requested = state.requestedPages.get(unitKey) ?? [];
      for (let page = start; page < start + emitted; page += 1) {
        requested.push(page);
      }
      state.requestedPages.set(unitKey, requested);
      state.nextPage.set(unitKey, start + emitted);
      const actual = { search: emitted, token: 1 };
      if (failAfter !== undefined && emitted >= failAfter) {
        return Promise.resolve({ kind: 'swept', outcome: 'failed', actual, error: 'transporte: 429' });
      }
      return Promise.resolve({ kind: 'swept', outcome: emitted >= remaining ? 'completed' : 'budget-exhausted', actual });
    },
    log(line: string): void {
      state.logged.push(line);
    },
  };
  return { ports, state };
}

const LEDGER: MonthlyLedgerState = { totalCap: 1000, reserve: 100, searchRequests: 0 };

function args(overrides: Partial<PresweepArgsLike> = {}): PresweepArgsLike {
  return { top: 1, maxRequests: 1000, maxRequestsPerSweep: 5, dryRun: false, ...overrides };
}

describe('runPresweep — tope por barrido (S4.1) y resumen por unidad', () => {
  it('S4.1: una unidad de 36 páginas con tope por barrido 5 hace EXACTAMENTE 5 peticiones, motivo per-sweep-cap, y queda reanudable', async () => {
    const world = createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 36 }, '28079:rent': { pages: 3 } } });

    const report = await runPresweep(world.ports, args());

    expect(world.state.requestedPages.get('28079:sale')).toEqual([1, 2, 3, 4, 5]);
    expect(report.units[0]).toMatchObject({ cityId: '28079', operation: 'sale', requests: 5, reason: 'per-sweep-cap' });
    // La unidad siguiente (alquiler, 3 páginas) sí se completa dentro de la misma ejecución.
    expect(report.units[1]).toMatchObject({ cityId: '28079', operation: 'rent', requests: 3, reason: 'unit-exhausted' });
    expect(report.totalRequests).toBe(8);
    expect(report.reason).toBe('plan-complete');
  });

  it('S5.1: la siguiente ejecución reanuda en la página 6 sin repetir ninguna ya pedida', async () => {
    const world = createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 36 }, '28079:rent': { pages: 3 } } });

    await runPresweep(world.ports, args());
    await runPresweep(world.ports, args());

    expect(world.state.requestedPages.get('28079:sale')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(world.state.requestedPages.get('28079:sale')).size).toBe(10);
  });

  it('pasa a cada barrido como tope duro EXACTAMENTE lo concedido por el registro', async () => {
    const world = createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 36 } } });

    await runPresweep(world.ports, args({ maxRequestsPerSweep: 7 }));

    expect(world.state.sweepCalls[0]).toEqual({ key: '28079:sale', hardCap: 7 });
    expect(world.state.reserveCalls[0]).toBe(7);
  });

  it('el gasto REAL manda: lo concedido y no gastado vuelve al registro (reserva 5, unidad de 2 páginas: queda 2 gastado)', async () => {
    const world = createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 2 }, '28079:rent': { pages: 2 } } });

    await runPresweep(world.ports, args());

    expect(world.state.ledger?.searchRequests).toBe(4);
  });
});

describe('runPresweep — techos globales (S4.2, S4.3) y señal de la fuente (S4.4)', () => {
  it('S4.2: con 3 de margen mensual del batch y tope por barrido 10 se hacen 3 peticiones, motivo techo mensual, y la ejecución se detiene', async () => {
    // total 100, reserva 30, gastado 67 => margen del batch = 3.
    const world = createWorld({
      ledger: { totalCap: 100, reserve: 30, searchRequests: 67 },
      units: { '28079:sale': { pages: 36 } },
    });

    const report = await runPresweep(world.ports, args({ top: 2, maxRequestsPerSweep: 10 }));

    expect(world.state.requestedPages.get('28079:sale')).toEqual([1, 2, 3]);
    expect(report.units).toHaveLength(1);
    expect(report.units[0]).toMatchObject({ requests: 3, reason: 'monthly-batch-ceiling' });
    expect(report.reason).toBe('monthly-batch-ceiling');
    // Ninguna otra unidad se intenta: ni reserva ni barrido.
    expect(world.state.sweepCalls).toHaveLength(1);
    expect(world.state.reserveCalls).toEqual([3]);
  });

  it('S4.3: con 2 de tope de ejecución restante, barrido 10 y techo 50 se hacen 2 peticiones, motivo tope de ejecución, y se detiene', async () => {
    const world = createWorld({ ledger: { totalCap: 1000, reserve: 100, searchRequests: 0 }, units: { '28079:sale': { pages: 36 } } });

    const report = await runPresweep(world.ports, args({ top: 2, maxRequests: 2, maxRequestsPerSweep: 10 }));

    expect(world.state.requestedPages.get('28079:sale')).toEqual([1, 2]);
    expect(report.units).toEqual([
      expect.objectContaining({ cityId: '28079', operation: 'sale', requests: 2, reason: 'run-cap' }),
    ]);
    expect(report.reason).toBe('run-cap');
    expect(world.state.sweepCalls).toHaveLength(1);
  });

  it('el tope de la ejecución se reparte entre unidades: 8 con barrido 5 son 5 + 3 y luego se detiene sin tocar la tercera unidad', async () => {
    const world = createWorld({
      ledger: LEDGER,
      units: { '28079:sale': { pages: 36 }, '28079:rent': { pages: 36 }, '08019:sale': { pages: 36 } },
    });

    const report = await runPresweep(world.ports, args({ top: 2, maxRequests: 8, maxRequestsPerSweep: 5 }));

    expect(report.units.map((unit) => [unit.cityId, unit.operation, unit.requests, unit.reason])).toEqual([
      ['28079', 'sale', 5, 'per-sweep-cap'],
      ['28079', 'rent', 3, 'run-cap'],
    ]);
    expect(report.totalRequests).toBe(8);
    expect(report.reason).toBe('run-cap');
  });

  it('S4.4: una señal de la fuente detiene la ejecución con el cursor persistido y deja las unidades siguientes sin tocar', async () => {
    const world = createWorld({
      ledger: LEDGER,
      units: { '28079:sale': { pages: 36, failAfter: 2 }, '28079:rent': { pages: 3 } },
    });

    const report = await runPresweep(world.ports, args({ top: 2 }));

    expect(report.units).toEqual([
      expect.objectContaining({ operation: 'sale', requests: 2, reason: 'upstream-signal', error: 'transporte: 429' }),
    ]);
    expect(report.reason).toBe('upstream-signal');
    expect(world.state.nextPage.get('28079:sale')).toBe(3);
    expect(world.state.sweepCalls).toHaveLength(1);
    // El gasto real (2) queda registrado; el resto de lo concedido (3) se devolvió.
    expect(world.state.ledger?.searchRequests).toBe(2);
  });

  it('si otro proceso consume margen entre la lectura y la reserva, la concesión parcial se informa como techo mensual', async () => {
    // Margen 10 al leer; un rival gasta 7 antes de reservar: la concesión es 3 de las 5 pedidas.
    const world = createWorld({
      ledger: { totalCap: 100, reserve: 30, searchRequests: 60 },
      units: { '28079:sale': { pages: 36 } },
      rivalSpendBeforeReserve: 7,
    });

    const report = await runPresweep(world.ports, args());

    expect(world.state.sweepCalls[0]).toEqual({ key: '28079:sale', hardCap: 3 });
    expect(report.units[0]).toMatchObject({ requests: 3, reason: 'monthly-batch-ceiling' });
    expect(report.reason).toBe('monthly-batch-ceiling');
  });
});

describe('runPresweep — plan, unidades omitidas y orden', () => {
  it('S2.1/S2.2: ciudades por población DESC y, por ciudad, venta y luego alquiler', async () => {
    const world = createWorld({ ledger: LEDGER });

    const report = await runPresweep(world.ports, args({ top: 2, maxRequestsPerSweep: 5 }));

    expect(report.units.map((unit) => `${unit.cityId}:${unit.operation}`)).toEqual([
      '28079:sale',
      '28079:rent',
      '08019:sale',
      '08019:rent',
    ]);
  });

  it('S5.2: una unidad ya completada se omite con cero peticiones y aparece como omitida', async () => {
    const candidates: readonly PresweepCandidate[] = [
      { id: '28079', municipality: 'Madrid', population: 3_300_000, units: { sale: 'completed', rent: 'pending' } },
    ];
    const world = createWorld({ ledger: LEDGER, candidates });

    const report = await runPresweep(world.ports, args());

    expect(world.state.sweepCalls.map((call) => call.key)).toEqual(['28079:rent']);
    expect(report.skipped).toEqual([{ cityId: '28079', operation: 'sale', why: 'completed' }]);
  });

  it('un reclamo que falla (otro proceso la tiene) devuelve toda la reserva, se informa como omitida y la ejecución sigue', async () => {
    const world = createWorld({
      ledger: LEDGER,
      units: { '28079:sale': { pages: 3, notClaimed: true }, '28079:rent': { pages: 3 } },
    });

    const report = await runPresweep(world.ports, args());

    expect(report.skipped).toEqual([
      { cityId: '28079', operation: 'sale', why: 'not-claimed', detail: 'ya reclamada por otro proceso' },
    ]);
    expect(report.units).toEqual([expect.objectContaining({ operation: 'rent', requests: 3 })]);
    expect(world.state.ledger?.searchRequests).toBe(3);
  });

  it('con todas las unidades completadas la ejecución termina con plan-complete y cero gasto', async () => {
    const candidates: readonly PresweepCandidate[] = [
      { id: '28079', municipality: 'Madrid', population: 3_300_000, units: { sale: 'completed', rent: 'completed' } },
    ];
    const world = createWorld({ ledger: LEDGER, candidates });

    const report = await runPresweep(world.ports, args());

    expect(report.reason).toBe('plan-complete');
    expect(report.totalRequests).toBe(0);
    expect(world.state.reserveCalls).toEqual([]);
  });
});

describe('runPresweep — preflight de solo lectura (S3.2, D13)', () => {
  it('sin ninguna fila de cuota (ni heredable): monthly-missing, cero reservas, cero barridos, ni siquiera lista candidatos; salida 1', async () => {
    const world = createWorld({ ledger: null });

    const report = await runPresweep(world.ports, args());

    expect(report.reason).toBe('monthly-missing');
    expect(report.totalRequests).toBe(0);
    expect(world.state.reserveCalls).toEqual([]);
    expect(world.state.sweepCalls).toEqual([]);
    expect(world.state.listCalls).toBe(0);
    expect(presweepExitCode(report)).toBe(1);
  });

  it('techo del batch en 0 (aunque el total no esté agotado): monthly-batch-ceiling, cero gasto; salida 0', async () => {
    const world = createWorld({ ledger: { totalCap: 100, reserve: 30, searchRequests: 70 } });

    const report = await runPresweep(world.ports, args());

    expect(report.reason).toBe('monthly-batch-ceiling');
    expect(report.totalRequests).toBe(0);
    expect(world.state.reserveCalls).toEqual([]);
    expect(world.state.sweepCalls).toEqual([]);
    expect(presweepExitCode(report)).toBe(0);
  });

  it('el gasto a demanda dentro de la reserva deja el techo del batch en 0 sin hacerlo negativo (total 100, reserva 30, gastado 90)', async () => {
    const state = { totalCap: 100, reserve: 30, searchRequests: 90 };
    expect(laneRemaining('batch', state)).toBe(0);
    const world = createWorld({ ledger: state });

    const report = await runPresweep(world.ports, args());

    expect(report.reason).toBe('monthly-batch-ceiling');
    expect(world.state.reserveCalls).toEqual([]);
  });

  it('--dry-run: lista el plan y la concesión prevista pero NO reserva ni barre nada; salida 0', async () => {
    const world = createWorld({ ledger: LEDGER });

    const report = await runPresweep(world.ports, args({ top: 2, dryRun: true }));

    expect(report.reason).toBe('dry-run');
    expect(report.totalRequests).toBe(0);
    expect(report.plannedUnits).toBe(4);
    expect(world.state.reserveCalls).toEqual([]);
    expect(world.state.sweepCalls).toEqual([]);
    expect(presweepExitCode(report)).toBe(0);
  });

  it('--dry-run con cuota inexistente también informa monthly-missing (salida 1) sin gastar', async () => {
    const world = createWorld({ ledger: null });

    const report = await runPresweep(world.ports, args({ dryRun: true }));

    expect(report.reason).toBe('monthly-missing');
    expect(presweepExitCode(report)).toBe(1);
  });
});

describe('presweepExitCode', () => {
  it('plan-complete, tope de ejecución y techo mensual son salidas normales (0); señal de la fuente y cuota ausente son 1', async () => {
    const complete = await runPresweep(createWorld({ ledger: LEDGER }).ports, args());
    const runCap = await runPresweep(
      createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 36 } } }).ports,
      args({ maxRequests: 2 })
    );
    const upstream = await runPresweep(
      createWorld({ ledger: LEDGER, units: { '28079:sale': { pages: 36, failAfter: 1 } } }).ports,
      args()
    );

    expect([complete.reason, presweepExitCode(complete)]).toEqual(['plan-complete', 0]);
    expect([runCap.reason, presweepExitCode(runCap)]).toEqual(['run-cap', 0]);
    expect([upstream.reason, presweepExitCode(upstream)]).toEqual(['upstream-signal', 1]);
  });
});

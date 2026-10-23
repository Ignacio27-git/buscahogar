// ROADMAP 3.4 (decisión 259, D17; R7.2-R7.6) — orquestación de los avisos operativos: foto del estado ->
// comprobaciones puras -> enfriamiento persistido -> tope por tick y presupuesto de salida compartido ->
// envío secuencial. Almacén, fuentes y Telegram FALSOS: cero DB, cero red.
import { describe, expect, it } from 'vitest';

import type { AlertCheckConfig } from '@buscahogar/core';

import { createAlerting, createDisabledAlerting } from '../src/alerts/alerting.js';
import type { AlertingDeps, AlertingSources, AlertingStore } from '../src/alerts/alerting.js';
import type { TelegramNotifier } from '../src/alerts/telegram-notifier.js';
import { createJsonLogger } from '../src/ops/json-logger.js';
import { createOutboundBudget } from '../src/ops/outbound-budget.js';

const CONFIG: AlertCheckConfig = {
  failedJobsThreshold: 5,
  failedJobsWindowMs: 24 * 3_600_000,
  failedJobsCooldownMs: 6 * 3_600_000,
};
const START = new Date('2026-10-22T10:00:00.000Z').getTime();

class MemoryStore implements AlertingStore {
  readonly rows = new Map<string, Date>();
  readonly purges: Date[] = [];
  failRecord = false;
  readTimes(keys: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    const found = new Map<string, Date>();
    for (const key of keys) {
      const at = this.rows.get(key);
      if (at !== undefined) {
        found.set(key, at);
      }
    }
    return Promise.resolve(found);
  }
  record(key: string, at: Date): Promise<void> {
    if (this.failRecord) {
      return Promise.reject(new Error('tabla no disponible'));
    }
    this.rows.set(key, at);
    return Promise.resolve();
  }
  purge(olderThan: Date): Promise<number> {
    this.purges.push(olderThan);
    return Promise.resolve(0);
  }
}

interface World {
  readonly store: MemoryStore;
  readonly sent: string[];
  readonly sources: { failedJobs: number; quota: { totalCap: number; searchRequests: number } | null; reads: number };
  readonly clock: { value: number };
  readonly lines: string[];
  readonly notifierResult: { ok: boolean };
  readonly deps: AlertingDeps;
}

function world(overrides: Partial<AlertingDeps> = {}, store: MemoryStore = new MemoryStore()): World {
  const sent: string[] = [];
  const clock = { value: START };
  const lines: string[] = [];
  const notifierResult = { ok: true };
  const sources = {
    failedJobs: 0,
    quota: { totalCap: 1000, searchRequests: 100 } as { totalCap: number; searchRequests: number } | null,
    reads: 0,
  };
  const notifier: TelegramNotifier = {
    send: (text) => {
      sent.push(text);
      clock.value += 1000;
      return Promise.resolve(notifierResult.ok);
    },
  };
  const alertingSources: AlertingSources = {
    countFailedJobs: () => {
      sources.reads += 1;
      return Promise.resolve(sources.failedJobs);
    },
    readQuota: () => Promise.resolve(sources.quota),
  };
  const deps: AlertingDeps = {
    config: CONFIG,
    notifier,
    store,
    sources: alertingSources,
    now: () => new Date(clock.value),
    log: createJsonLogger({ component: 'coverage-worker', write: (line) => lines.push(line) }),
    maxPerTick: 3,
    reserveSlots: 1,
    failureBackoffMs: 60_000,
    ...overrides,
  };
  return { store, sent, sources, clock, lines, notifierResult, deps };
}

describe('createDisabledAlerting — sin token/chat', () => {
  it('no consulta nada ni envía nada y no gasta plazas del presupuesto', async () => {
    const alerting = createDisabledAlerting();
    const budget = createOutboundBudget(4);

    alerting.recordDeniedReservation();
    await alerting.onStaleJobsReclaimed({ jobIds: ['a'], alertKey: 'stale-reclaim:2026-10-22' });
    await alerting.alertStep(budget);

    expect(alerting.enabled).toBe(false);
    expect(budget.remaining()).toBe(4);
  });
});

describe('createAlerting — arranque y deduplicación persistida', () => {
  it('el primer paso avisa del arranque; el segundo, no (se consume)', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);

    await alerting.alertStep(createOutboundBudget(4));
    await alerting.alertStep(createOutboundBudget(4));

    expect(w.sent).toEqual(['El worker de cobertura se ha iniciado.']);
    expect([...w.store.rows.keys()]).toEqual(['worker-started']);
  });

  it('un REINICIO dentro del enfriamiento (proceso nuevo, mismo almacén) no reenvía el arranque ni la cuota', async () => {
    const store = new MemoryStore();
    const first = world({}, store);
    first.sources.quota = { totalCap: 1000, searchRequests: 810 };
    await createAlerting(first.deps).alertStep(createOutboundBudget(4));
    expect(first.sent).toHaveLength(2);

    const second = world({}, store);
    second.clock.value = first.clock.value + 10 * 60_000;
    second.sources.quota = { totalCap: 1000, searchRequests: 830 };
    await createAlerting(second.deps).alertStep(createOutboundBudget(4));

    expect(second.sent).toEqual([]);
  });

  it('pasado el enfriamiento de 1 h el arranque vuelve a avisarse en el proceso nuevo', async () => {
    const store = new MemoryStore();
    const first = world({}, store);
    await createAlerting(first.deps).alertStep(createOutboundBudget(4));

    const second = world({}, store);
    second.clock.value = first.clock.value + 3_600_000;
    await createAlerting(second.deps).alertStep(createOutboundBudget(4));

    expect(second.sent).toEqual(['El worker de cobertura se ha iniciado.']);
  });
});

describe('createAlerting — condiciones', () => {
  it('cuota 79 % -> 81 %: un solo aviso del 80 %, y no se repite en ticks posteriores', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);
    w.sources.quota = { totalCap: 1000, searchRequests: 790 };
    await alerting.alertStep(createOutboundBudget(4));
    w.sent.length = 0;

    w.sources.quota = { totalCap: 1000, searchRequests: 810 };
    await alerting.alertStep(createOutboundBudget(4));
    await alerting.alertStep(createOutboundBudget(4));

    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain('81 %');
  });

  it('fallos de jobs por encima del umbral avisan; por debajo, no', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);
    await alerting.alertStep(createOutboundBudget(4));
    w.sent.length = 0;

    w.sources.failedJobs = 4;
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toEqual([]);

    w.sources.failedJobs = 6;
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain('6 jobs');
  });

  it('la recuperación de jobs atascados genera su aviso con la clave del día y se consume tras enviarse', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);
    await alerting.alertStep(createOutboundBudget(4));
    w.sent.length = 0;

    await alerting.onStaleJobsReclaimed({ jobIds: ['job-a', 'job-b'], alertKey: 'stale-reclaim:2026-10-22' });
    await alerting.alertStep(createOutboundBudget(4));
    await alerting.alertStep(createOutboundBudget(4));

    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain('2 job(s)');
    expect(w.sent[0]).not.toContain('job-a');
    expect(w.store.rows.has('stale-reclaim:2026-10-22')).toBe(true);
  });

  it('las reservas denegadas del día generan UN aviso con el recuento; al cambiar de día el contador empieza de cero', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);
    await alerting.alertStep(createOutboundBudget(4));
    w.sent.length = 0;

    alerting.recordDeniedReservation();
    alerting.recordDeniedReservation();
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain('2');

    w.clock.value += 24 * 3_600_000;
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(1);

    alerting.recordDeniedReservation();
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(2);
    expect(w.sent[1]).toContain('1');
  });

  it('sin cuota mensual (monthly-missing) avisa una vez', async () => {
    const w = world();
    w.sources.quota = null;
    const alerting = createAlerting(w.deps);

    await alerting.alertStep(createOutboundBudget(4));
    await alerting.alertStep(createOutboundBudget(4));

    expect(w.sent.filter((text) => text.includes('No hay cuota mensual'))).toHaveLength(1);
  });
});

describe('createAlerting — tope por tick y presupuesto de salida compartido', () => {
  function everythingFires(w: World): void {
    w.sources.failedJobs = 9;
    w.sources.quota = { totalCap: 1000, searchRequests: 1000 };
  }

  it('con 5 condiciones a la vez: como mucho 3 mensajes (2 avisos + un resumen "+N más")', async () => {
    const w = world();
    everythingFires(w);
    const alerting = createAlerting(w.deps);
    alerting.recordDeniedReservation();
    await alerting.onStaleJobsReclaimed({ jobIds: ['a'], alertKey: 'stale-reclaim:2026-10-22' });

    await alerting.alertStep(createOutboundBudget(10));

    expect(w.sent).toHaveLength(3);
    expect(w.sent[2]).toContain('+3 avisos más');
  });

  it('lo plegado en el resumen se entrega en los ticks siguientes, sin reenviar lo ya enviado', async () => {
    const w = world();
    everythingFires(w);
    const alerting = createAlerting(w.deps);
    alerting.recordDeniedReservation();
    await alerting.onStaleJobsReclaimed({ jobIds: ['a'], alertKey: 'stale-reclaim:2026-10-22' });

    for (let tick = 0; tick < 4; tick += 1) {
      await alerting.alertStep(createOutboundBudget(10));
    }

    const individual = w.sent.filter((text) => !text.startsWith('+'));
    expect(individual).toHaveLength(5);
    expect(new Set(individual).size).toBe(5);
  });

  it('con el presupuesto por defecto (4) los avisos dejan SIEMPRE una plaza al latido', async () => {
    const w = world();
    everythingFires(w);
    const alerting = createAlerting(w.deps);
    alerting.recordDeniedReservation();
    const budget = createOutboundBudget(4);

    await alerting.alertStep(budget);

    expect(w.sent).toHaveLength(3);
    expect(budget.remaining()).toBe(1);
  });

  it('con un presupuesto de 2 plazas solo se usa una (la otra es del latido); con 1 o 0, ninguna', async () => {
    const two = world();
    everythingFires(two);
    const budget2 = createOutboundBudget(2);
    await createAlerting(two.deps).alertStep(budget2);
    expect(two.sent).toHaveLength(1);
    expect(budget2.remaining()).toBe(1);

    for (const slots of [1, 0]) {
      const w = world();
      everythingFires(w);
      const budget = createOutboundBudget(slots);
      await createAlerting(w.deps).alertStep(budget);
      expect(w.sent).toEqual([]);
      expect(budget.remaining()).toBe(slots);
    }
  });

  it('sin reserva para el latido (reserveSlots 0) los avisos pueden usar todas las plazas', async () => {
    const w = world({ reserveSlots: 0, maxPerTick: 10 });
    everythingFires(w);
    const alerting = createAlerting(w.deps);
    alerting.recordDeniedReservation();
    await alerting.onStaleJobsReclaimed({ jobIds: ['a'], alertKey: 'stale-reclaim:2026-10-22' });
    const budget = createOutboundBudget(4);

    await alerting.alertStep(budget);

    expect(w.sent).toHaveLength(4);
    expect(budget.remaining()).toBe(0);
  });
});

describe('createAlerting — fallos de Telegram y del almacén', () => {
  it('Telegram falla: el paso no lanza, no se registra nada como enviado y se reintenta tras la espera', async () => {
    const w = world();
    w.notifierResult.ok = false;
    const alerting = createAlerting(w.deps);

    await expect(alerting.alertStep(createOutboundBudget(4))).resolves.toBeUndefined();
    expect(w.sent).toHaveLength(1);
    expect(w.store.rows.size).toBe(0);

    // Dentro de la espera tras fallo: ni un intento más (no se martillea a un canal caído).
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(1);

    // Pasada la espera y recuperado el canal, el aviso pendiente se entrega.
    w.clock.value += 60_000;
    w.notifierResult.ok = true;
    await alerting.alertStep(createOutboundBudget(4));
    expect(w.sent).toHaveLength(2);
    expect(w.store.rows.has('worker-started')).toBe(true);
  });

  it('el primer fallo corta el resto de envíos de ese tick', async () => {
    const w = world();
    w.notifierResult.ok = false;
    w.sources.failedJobs = 9;
    w.sources.quota = { totalCap: 1000, searchRequests: 1000 };
    const alerting = createAlerting(w.deps);

    await alerting.alertStep(createOutboundBudget(10));

    expect(w.sent).toHaveLength(1);
  });

  it('si el almacén no puede registrar el envío se registra el fallo y el paso continúa sin lanzar', async () => {
    const w = world();
    w.store.failRecord = true;
    const alerting = createAlerting(w.deps);

    await expect(alerting.alertStep(createOutboundBudget(4))).resolves.toBeUndefined();

    expect(w.sent).toHaveLength(1);
    expect(w.lines.some((line) => line.includes('alert-record-failed'))).toBe(true);
  });

  it('una avería al leer el estado se propaga (el driver la aísla) sin enviar nada', async () => {
    const w = world();
    const failing: AlertingSources = {
      countFailedJobs: () => Promise.reject(new Error('base caída')),
      readQuota: () => Promise.resolve(null),
    };
    const alerting = createAlerting({ ...w.deps, sources: failing });

    await expect(alerting.alertStep(createOutboundBudget(4))).rejects.toThrow('base caída');
    expect(w.sent).toEqual([]);
  });

  it('tras enviar se purga el registro antiguo (corte de 90 días), y no si no se envió nada', async () => {
    const w = world();
    const alerting = createAlerting(w.deps);

    await alerting.alertStep(createOutboundBudget(4));
    await alerting.alertStep(createOutboundBudget(4));

    expect(w.store.purges).toHaveLength(1);
    expect(w.store.purges[0]?.toISOString()).toBe(new Date(w.clock.value - 90 * 24 * 3_600_000).toISOString());
  });
});

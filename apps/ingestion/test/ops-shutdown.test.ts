// ROADMAP 3.4 (decisión 258, D14; R6.2) — apagado del worker: espera abortable, primer aviso (parada ordenada
// con plazo `WORKER_STOP_GRACE_MS`) y segundo aviso (salida forzada). Reloj falso, sin procesos reales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAbortableSleep } from '../src/ops/abortable-sleep.js';
import { createJsonLogger } from '../src/ops/json-logger.js';
import { createShutdown } from '../src/ops/shutdown.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createAbortableSleep', () => {
  it('espera el tiempo pedido cuando nadie aborta (y no antes)', async () => {
    const controller = new AbortController();
    const sleep = createAbortableSleep(controller.signal);
    let done = false;
    void sleep(1000).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('se resuelve al instante cuando se aborta durante la espera y libera el temporizador', async () => {
    const controller = new AbortController();
    const sleep = createAbortableSleep(controller.signal);
    let done = false;
    void sleep(60_000).then(() => {
      done = true;
    });
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('con la señal ya abortada no crea ningún temporizador', async () => {
    const controller = new AbortController();
    controller.abort();
    const sleep = createAbortableSleep(controller.signal);

    await sleep(60_000);

    expect(vi.getTimerCount()).toBe(0);
  });
});

function setup(graceMs = 8000): {
  readonly exits: number[];
  readonly events: Record<string, unknown>[];
  readonly shutdown: ReturnType<typeof createShutdown>;
} {
  const exits: number[] = [];
  const events: Record<string, unknown>[] = [];
  const log = createJsonLogger({
    component: 'coverage-worker',
    write: (line) => {
      events.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  const shutdown = createShutdown({
    graceMs,
    log,
    exit: (code) => {
      exits.push(code);
    },
  });
  return { exits, events, shutdown };
}

describe('createShutdown', () => {
  it('antes de cualquier señal no hay parada ni temporizador', () => {
    const { shutdown, exits } = setup();

    expect(shutdown.requested()).toBe(false);
    expect(shutdown.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(exits).toEqual([]);
  });

  it('la primera señal pide parar, aborta la señal y arma el plazo sin salir todavía', () => {
    const { shutdown, exits, events } = setup();

    shutdown.request('SIGTERM');

    expect(shutdown.requested()).toBe(true);
    expect(shutdown.signal.aborted).toBe(true);
    expect(exits).toEqual([]);
    expect(events[0]).toMatchObject({ level: 'info', msg: 'shutdown-requested', signal: 'SIGTERM' });
  });

  it('si el plazo vence antes de terminar, sale con código 1 y lo registra', async () => {
    const { shutdown, exits, events } = setup(8000);
    shutdown.request('SIGTERM');

    await vi.advanceTimersByTimeAsync(7999);
    expect(exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(exits).toEqual([1]);
    expect(events.at(-1)).toMatchObject({ level: 'fatal', msg: 'shutdown-grace-expired', grace_ms: 8000 });
  });

  it('`dispose` tras una parada limpia cancela el plazo: no hay salida forzada', async () => {
    const { shutdown, exits } = setup(8000);
    shutdown.request('SIGINT');

    shutdown.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(exits).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la segunda señal fuerza la salida con código 1 al instante', () => {
    const { shutdown, exits, events } = setup();
    shutdown.request('SIGTERM');

    shutdown.request('SIGTERM');

    expect(exits).toEqual([1]);
    expect(events.at(-1)).toMatchObject({ level: 'fatal', msg: 'shutdown-forced', signal: 'SIGTERM' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('`setGraceMs` cambia el plazo que se usará en la primera señal', async () => {
    const { shutdown, exits } = setup(8000);
    shutdown.setGraceMs(500);

    shutdown.request('SIGTERM');
    await vi.advanceTimersByTimeAsync(500);

    expect(exits).toEqual([1]);
  });
});

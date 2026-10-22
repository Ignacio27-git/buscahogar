// ROADMAP 3.4 (decisión 258, D14, D15; R6.2, R6.3) — orquestación del proceso del worker: configuración,
// conexión inicial con backoff, supervisor, parada y códigos de salida (0 parada limpia · 1 caídas/forzada ·
// 2 configuración · 3 base inaccesible). Todo contra una sesión FALSA y relojes falsos: ni base de datos, ni
// red, ni temporizadores reales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonLogger } from '../src/ops/json-logger.js';
import { createShutdown } from '../src/ops/shutdown.js';
import { CONFIG_ERROR_WAIT_MS, runWorkerProcess, WORKER_EXIT } from '../src/ops/worker-process.js';
import type { WorkerSession } from '../src/ops/worker-process.js';

interface TestConfig {
  readonly stopGraceMs: number;
  readonly secret: string;
}

const CONFIG: TestConfig = { stopGraceMs: 3000, secret: 'sk-super-secreto' };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

interface Harness {
  readonly events: Record<string, unknown>[];
  readonly lines: string[];
  readonly exits: number[];
  readonly delays: number[];
  readonly shutdown: ReturnType<typeof createShutdown>;
  readonly closed: { count: number };
  readonly sessionsCreated: { count: number };
  run(options: {
    readonly loadConfig?: () => TestConfig;
    readonly probe?: () => Promise<void>;
    readonly runWorker?: () => Promise<void>;
    readonly close?: () => Promise<void>;
    readonly warnings?: readonly { name: string; severity: 'production-warning'; reason: string }[];
  }): Promise<number>;
}

function harness(): Harness {
  const events: Record<string, unknown>[] = [];
  const lines: string[] = [];
  const exits: number[] = [];
  const delays: number[] = [];
  const closed = { count: 0 };
  const sessionsCreated = { count: 0 };
  const log = createJsonLogger({
    component: 'coverage-worker',
    write: (line) => {
      lines.push(line);
      events.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  const shutdown = createShutdown({
    graceMs: 8000,
    log,
    exit: (code) => {
      exits.push(code);
    },
  });
  return {
    events,
    lines,
    exits,
    delays,
    shutdown,
    closed,
    sessionsCreated,
    run: (options) =>
      runWorkerProcess<TestConfig>({
        log,
        shutdown,
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
        now: () => Date.now(),
        loadConfig: options.loadConfig ?? ((): TestConfig => CONFIG),
        secretsOf: (config) => [config.secret],
        warnings: options.warnings ?? [],
        createSession: (): WorkerSession => {
          sessionsCreated.count += 1;
          return {
            probe: options.probe ?? ((): Promise<void> => Promise.resolve()),
            run: options.runWorker ?? ((): Promise<void> => Promise.resolve()),
            close: (): Promise<void> => {
              closed.count += 1;
              return options.close ? options.close() : Promise.resolve();
            },
          };
        },
      }),
  };
}

describe('runWorkerProcess — configuración inválida (exit 2)', () => {
  it('registra un fatal JSON, espera 30 s (abortable) y sale con 2 sin abrir ninguna sesión', async () => {
    const h = harness();

    const code = await h.run({
      loadConfig: () => {
        throw new Error('Faltan variables de entorno: DATABASE_URL');
      },
    });

    expect(code).toBe(WORKER_EXIT.config);
    expect(CONFIG_ERROR_WAIT_MS).toBe(30_000);
    expect(h.delays).toEqual([30_000]);
    expect(h.sessionsCreated.count).toBe(0);
    expect(h.events[0]).toMatchObject({
      level: 'fatal',
      msg: 'config-invalid',
      reason: 'Faltan variables de entorno: DATABASE_URL',
      exit_code: 2,
      retry_in_ms: 30_000,
    });
  });
});

describe('runWorkerProcess — configuración inválida y parada', () => {
  it('SIGTERM durante la espera: sale 2 y NO deja el plazo de parada armado (sin salida forzada posterior)', async () => {
    const h = harness();
    h.shutdown.request('SIGTERM');

    const code = await h.run({
      loadConfig: () => {
        throw new Error('config rota');
      },
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(code).toBe(WORKER_EXIT.config);
    expect(h.exits).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('runWorkerProcess — arranque', () => {
  it('registra cada aviso de producción UNA vez como warn y solo con nombre y motivo', async () => {
    const h = harness();

    await h.run({
      warnings: [{ name: 'HEARTBEAT_URL', severity: 'production-warning', reason: 'sin latido' }],
    });

    const warns = h.events.filter((event) => event.level === 'warn');
    expect(warns).toEqual([
      expect.objectContaining({ msg: 'production-warning', name: 'HEARTBEAT_URL', reason: 'sin latido' }),
    ]);
  });

  it('base inaccesible: 8 intentos con 1→60 s de espera y salida 3', async () => {
    const h = harness();
    let probes = 0;

    const code = await h.run({
      probe: () => {
        probes += 1;
        return Promise.reject(new Error('ECONNREFUSED'));
      },
    });

    expect(code).toBe(WORKER_EXIT.dbUnreachable);
    expect(probes).toBe(8);
    expect(h.delays).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000]);
    expect(h.events.at(-1)).toMatchObject({ level: 'fatal', msg: 'db-unreachable', exit_code: 3 });
    expect(h.closed.count).toBe(1);
  });

  it('base que aparece al tercer intento: arranca y sale 0', async () => {
    const h = harness();
    let probes = 0;
    let runs = 0;

    const code = await h.run({
      probe: () => {
        probes += 1;
        return probes < 3 ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve();
      },
      runWorker: () => {
        runs += 1;
        return Promise.resolve();
      },
    });

    expect(code).toBe(WORKER_EXIT.ok);
    expect(runs).toBe(1);
    expect(h.events.filter((event) => event.msg === 'db-connect-retry')).toHaveLength(2);
  });
});

describe('runWorkerProcess — supervisión', () => {
  it('una caída se registra, espera 1 s y reintenta; al terminar limpio sale 0', async () => {
    const h = harness();
    let runs = 0;

    const code = await h.run({
      runWorker: () => {
        runs += 1;
        return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve();
      },
    });

    expect(code).toBe(0);
    expect(runs).toBe(2);
    expect(h.delays).toEqual([1000]);
    expect(h.events.find((event) => event.msg === 'worker-crashed')).toMatchObject({
      level: 'error',
      consecutive: 1,
      delay_ms: 1000,
      reason: 'boom',
    });
  });

  it('10 caídas seguidas: fatal worker-gave-up y salida 1', async () => {
    const h = harness();

    const code = await h.run({ runWorker: () => Promise.reject(new Error('siempre')) });

    expect(code).toBe(WORKER_EXIT.crashLoop);
    expect(h.events.at(-1)).toMatchObject({ level: 'fatal', msg: 'worker-gave-up', exit_code: 1 });
    expect(h.closed.count).toBe(1);
  });
});

describe('runWorkerProcess — parada (SIGTERM/SIGINT)', () => {
  it('SIGTERM con el worker ocioso: el trabajo termina, sale 0 dentro del plazo y no queda ningún temporizador', async () => {
    const h = harness();
    let finish: () => void = () => undefined;
    const done = h.run({
      runWorker: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    await vi.advanceTimersByTimeAsync(0);

    h.shutdown.request('SIGTERM');
    finish();
    const code = await done;

    expect(code).toBe(0);
    expect(h.exits).toEqual([]);
    expect(h.closed.count).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('el plazo sale de WORKER_STOP_GRACE_MS: si el worker no termina a tiempo, salida forzada 1', async () => {
    const h = harness();
    void h.run({ runWorker: () => new Promise<void>(() => undefined) });
    await vi.advanceTimersByTimeAsync(0);

    h.shutdown.request('SIGTERM');
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(h.exits).toEqual([1]);
    expect(h.events.at(-1)).toMatchObject({ msg: 'shutdown-grace-expired', grace_ms: 3000 });
  });

  it('la segunda señal fuerza la salida 1 al instante', async () => {
    const h = harness();
    void h.run({ runWorker: () => new Promise<void>(() => undefined) });
    await vi.advanceTimersByTimeAsync(0);

    h.shutdown.request('SIGTERM');
    h.shutdown.request('SIGINT');

    expect(h.exits).toEqual([1]);
  });

  it('una parada pedida durante la conexión inicial sale 0 sin lanzar el worker', async () => {
    const h = harness();
    let runs = 0;

    const code = await h.run({
      probe: () => {
        h.shutdown.request('SIGTERM');
        return Promise.reject(new Error('ECONNREFUSED'));
      },
      runWorker: () => {
        runs += 1;
        return Promise.resolve();
      },
    });

    expect(code).toBe(0);
    expect(runs).toBe(0);
  });
});

describe('runWorkerProcess — cierre y secretos', () => {
  it('cierra la sesión en TODOS los caminos y un fallo al cerrar se registra sin cambiar la salida', async () => {
    const h = harness();

    const code = await h.run({ close: () => Promise.reject(new Error('pool.end falló')) });

    expect(code).toBe(0);
    expect(h.closed.count).toBe(1);
    expect(h.events.find((event) => event.msg === 'session-close-failed')).toMatchObject({
      level: 'error',
      reason: 'pool.end falló',
    });
  });

  it('el valor de un secreto de la configuración nunca llega al registro, ni dentro del mensaje de un error', async () => {
    const h = harness();

    await h.run({ runWorker: () => Promise.reject(new Error(`fallo con ${CONFIG.secret} dentro`)) });

    expect(h.lines.join('\n')).not.toContain(CONFIG.secret);
    expect(h.lines.join('\n')).toContain('[redacted]');
  });
});

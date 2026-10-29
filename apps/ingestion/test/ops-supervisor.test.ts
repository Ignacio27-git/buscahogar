// ROADMAP 3.4 (decisión 258, D15; R6.3) — supervisor en proceso y backoff de arranque. Reloj y espera falsos:
// ningún temporizador real, ningún proceso. Cada espera registrada es la que el worker pediría de verdad.
import { describe, expect, it } from 'vitest';

import { connectWithBackoff, STARTUP_DEFAULTS } from '../src/ops/startup-backoff.js';
import { runSupervised, SUPERVISOR_DEFAULTS } from '../src/ops/supervisor.js';
import type { SupervisorOptions } from '../src/ops/supervisor.js';

interface Harness {
  readonly delays: number[];
  readonly crashes: { readonly consecutive: number; readonly delayMs: number | null; readonly message: string }[];
  readonly options: SupervisorOptions;
  advance(ms: number): void;
  stop(): void;
}

function harness(overrides: Partial<SupervisorOptions> = {}): Harness {
  const delays: number[] = [];
  const crashes: { consecutive: number; delayMs: number | null; message: string }[] = [];
  let clock = 0;
  let stopped = false;
  return {
    delays,
    crashes,
    advance: (ms: number): void => {
      clock += ms;
    },
    stop: (): void => {
      stopped = true;
    },
    options: {
      ...SUPERVISOR_DEFAULTS,
      sleep: (ms: number): Promise<void> => {
        delays.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: (): number => clock,
      shouldContinue: (): boolean => !stopped,
      onCrash: (event): void => {
        crashes.push(event);
      },
      ...overrides,
    },
  };
}

describe('SUPERVISOR_DEFAULTS (decisión 258)', () => {
  it('1 s base, 300 s tope, 600 s de estabilidad, 10 caídas seguidas', () => {
    expect(SUPERVISOR_DEFAULTS).toMatchObject({ baseMs: 1000, maxMs: 300_000, stableResetMs: 600_000, maxConsecutive: 10 });
  });
});

describe('runSupervised — backoff exponencial acotado', () => {
  it('una ejecución que termina sin lanzar es una parada ordenada: no se reintenta', async () => {
    const h = harness();
    let runs = 0;

    const result = await runSupervised(() => {
      runs += 1;
      return Promise.resolve();
    }, h.options);

    expect(result).toBe('stopped');
    expect(runs).toBe(1);
    expect(h.delays).toEqual([]);
  });

  it('cada caída espera min(1 s · 2^n, 300 s) y reintenta; tras recuperarse devuelve stopped', async () => {
    const h = harness();
    let runs = 0;

    const result = await runSupervised(() => {
      runs += 1;
      return runs <= 3 ? Promise.reject(new Error(`caída ${String(runs)}`)) : Promise.resolve();
    }, h.options);

    expect(result).toBe('stopped');
    expect(runs).toBe(4);
    expect(h.delays).toEqual([1000, 2000, 4000]);
    expect(h.crashes).toEqual([
      { consecutive: 1, delayMs: 1000, message: 'caída 1' },
      { consecutive: 2, delayMs: 2000, message: 'caída 2' },
      { consecutive: 3, delayMs: 4000, message: 'caída 3' },
    ]);
  });

  it('el retardo crece hasta el tope de 300 s y ahí se queda', async () => {
    const h = harness({ maxConsecutive: 12 });

    const result = await runSupervised(() => Promise.reject(new Error('siempre')), h.options);

    expect(result).toBe('gave-up');
    expect(h.delays).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000]);
  });
});

describe('runSupervised — 10 caídas seguidas', () => {
  it('a la décima caída consecutiva se rinde (gave-up) sin esperar una vez más', async () => {
    const h = harness();
    let runs = 0;

    const result = await runSupervised(() => {
      runs += 1;
      return Promise.reject(new Error('siempre'));
    }, h.options);

    expect(result).toBe('gave-up');
    expect(runs).toBe(10);
    expect(h.delays).toHaveLength(9);
    expect(h.crashes.at(-1)).toEqual({ consecutive: 10, delayMs: null, message: 'siempre' });
  });

  it('9 caídas y una ejecución buena NO llegan al límite', async () => {
    const h = harness();
    let runs = 0;

    const result = await runSupervised(() => {
      runs += 1;
      return runs <= 9 ? Promise.reject(new Error('x')) : Promise.resolve();
    }, h.options);

    expect(result).toBe('stopped');
    expect(runs).toBe(10);
  });
});

describe('runSupervised — reinicio tras 600 s estables', () => {
  it('una ejecución que dura ≥ 600 s antes de caer reinicia la cuenta y el retardo vuelve a 1 s', async () => {
    const h = harness();
    let runs = 0;

    await runSupervised(() => {
      runs += 1;
      if (runs === 3) {
        // La tercera ejecución se mantiene estable 600 s y después cae.
        h.advance(600_000);
      }
      return runs <= 3 ? Promise.reject(new Error('x')) : Promise.resolve();
    }, h.options);

    expect(h.delays).toEqual([1000, 2000, 1000]);
    expect(h.crashes.map((event) => event.consecutive)).toEqual([1, 2, 1]);
  });

  it('599 999 ms NO bastan: la cuenta sigue creciendo', async () => {
    const h = harness();
    let runs = 0;

    await runSupervised(() => {
      runs += 1;
      if (runs === 3) {
        h.advance(599_999);
      }
      return runs <= 3 ? Promise.reject(new Error('x')) : Promise.resolve();
    }, h.options);

    expect(h.delays).toEqual([1000, 2000, 4000]);
  });
});

describe('runSupervised — parada solicitada', () => {
  it('si se pide parar durante el backoff no se vuelve a ejecutar', async () => {
    const h = harness();
    let runs = 0;
    const options: SupervisorOptions = {
      ...h.options,
      sleep: (ms) => {
        h.delays.push(ms);
        h.stop();
        return Promise.resolve();
      },
    };

    const result = await runSupervised(() => {
      runs += 1;
      return Promise.reject(new Error('x'));
    }, options);

    expect(result).toBe('stopped');
    expect(runs).toBe(1);
  });

  it('con la parada ya pedida no ejecuta nada', async () => {
    const h = harness();
    h.stop();
    let runs = 0;

    const result = await runSupervised(() => {
      runs += 1;
      return Promise.resolve();
    }, h.options);

    expect(result).toBe('stopped');
    expect(runs).toBe(0);
  });
});

describe('connectWithBackoff — arranque (DB inaccesible)', () => {
  function startup(overrides: { stopAfterSleeps?: number } = {}): {
    readonly delays: number[];
    readonly retries: { readonly attempt: number; readonly delayMs: number; readonly message: string }[];
    readonly options: Parameters<typeof connectWithBackoff>[1];
  } {
    const delays: number[] = [];
    const retries: { attempt: number; delayMs: number; message: string }[] = [];
    return {
      delays,
      retries,
      options: {
        ...STARTUP_DEFAULTS,
        sleep: (ms: number): Promise<void> => {
          delays.push(ms);
          return Promise.resolve();
        },
        shouldContinue: () => overrides.stopAfterSleeps === undefined || delays.length < overrides.stopAfterSleeps,
        onRetry: (event): void => {
          retries.push(event);
        },
      },
    };
  }

  it('STARTUP_DEFAULTS: 1 s → 60 s, 8 intentos', () => {
    expect(STARTUP_DEFAULTS).toMatchObject({ baseMs: 1000, maxMs: 60_000, maxAttempts: 8 });
  });

  it('conecta al primer intento sin esperar nada', async () => {
    const s = startup();

    const result = await connectWithBackoff(() => Promise.resolve(), s.options);

    expect(result).toBe('connected');
    expect(s.delays).toEqual([]);
  });

  it('reintenta con 1 s, 2 s… y conecta al tercer intento', async () => {
    const s = startup();
    let attempts = 0;

    const result = await connectWithBackoff(() => {
      attempts += 1;
      return attempts < 3 ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve();
    }, s.options);

    expect(result).toBe('connected');
    expect(attempts).toBe(3);
    expect(s.delays).toEqual([1000, 2000]);
    expect(s.retries[0]).toEqual({ attempt: 1, delayMs: 1000, message: 'ECONNREFUSED' });
  });

  it('tras 8 intentos fallidos devuelve unreachable: 7 esperas (1,2,4,8,16,32,60 s)', async () => {
    const s = startup();
    let attempts = 0;

    const result = await connectWithBackoff(() => {
      attempts += 1;
      return Promise.reject(new Error('ECONNREFUSED'));
    }, s.options);

    expect(result).toBe('unreachable');
    expect(attempts).toBe(8);
    expect(s.delays).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000]);
  });

  it('si se pide parar durante la espera devuelve stopped y no vuelve a intentar', async () => {
    const s = startup({ stopAfterSleeps: 1 });
    let attempts = 0;

    const result = await connectWithBackoff(() => {
      attempts += 1;
      return Promise.reject(new Error('ECONNREFUSED'));
    }, s.options);

    expect(result).toBe('stopped');
    expect(attempts).toBe(1);
  });
});

// ROADMAP 3.4 (decisión 255, D4/D5, PD9; R1.7) — limitador del proxy sobre un almacén COMPARTIDO con
// fallo abierto y plazo total de 200 ms. El reloj es siempre inyectado o falso (`vi.useFakeTimers`); el
// almacén es un doble. La equivalencia SQL contra el núcleo se prueba en `packages/db/test`.
import { evaluateFixedWindow } from '@buscahogar/core';
import type { FixedWindowState } from '@buscahogar/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProxyRateLimiter } from '../src/server/proxy-rate-limit.js';
import type { ProxyRateLimitStore } from '../src/server/proxy-rate-limit.js';

const PARAMS = { max: 2, windowMs: 60_000 };
const KEY = 'hmac-of-someone';

// Doble en memoria que aplica la política del núcleo: lo que haría el almacén SQL.
function memoryStore(): ProxyRateLimitStore & { calls: number } {
  const buckets = new Map<string, FixedWindowState>();
  const store = {
    calls: 0,
    hit(key: string, nowMs: number, params: { max: number; windowMs: number }): Promise<FixedWindowState> {
      store.calls += 1;
      const result = evaluateFixedWindow(buckets.get(key), nowMs, params);
      buckets.set(key, result.state);
      return Promise.resolve(result.state);
    },
  };
  return store;
}

function parsedLines(log: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return log.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

describe('createProxyRateLimiter — veredicto con el almacén disponible (decisión 255)', () => {
  it('permite hasta max y rechaza la siguiente con Retry-After > 0', async () => {
    const limiter = createProxyRateLimiter({ store: memoryStore() });

    const results = [
      await limiter.hit(KEY, 0, PARAMS),
      await limiter.hit(KEY, 100, PARAMS),
      await limiter.hit(KEY, 200, PARAMS),
    ];

    expect(results.map((result) => result.allowed)).toEqual([true, true, false]);
    expect(results[2]?.retryAfterSeconds).toBe(60);
    expect(results[0]?.retryAfterSeconds).toBe(0);
  });

  it('cada clave cuenta aparte y una ventana nueva reinicia el conteo', async () => {
    const limiter = createProxyRateLimiter({ store: memoryStore() });
    const one = { max: 1, windowMs: 1_000 };

    expect((await limiter.hit('a', 0, one)).allowed).toBe(true);
    expect((await limiter.hit('unknown', 0, one)).allowed).toBe(true);
    expect((await limiter.hit('a', 0, one)).allowed).toBe(false);
    expect((await limiter.hit('a', 2_000, one)).allowed).toBe(true);
  });

  it('pasa al almacén la clave, el instante y los parámetros tal cual', async () => {
    const hit = vi.fn(() => Promise.resolve({ count: 1, windowStart: 7 }));
    const limiter = createProxyRateLimiter({ store: { hit } });

    await limiter.hit(KEY, 7, PARAMS);

    expect(hit).toHaveBeenCalledExactlyOnceWith(KEY, 7, PARAMS);
  });
});

describe('createProxyRateLimiter — fallo abierto (R1.7, PD9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('si el almacén rechaza, la petición se permite y se registra UNA línea JSON de error sin clave ni URL', async () => {
    const log = vi.fn();
    const store: ProxyRateLimitStore = {
      hit: () => Promise.reject(new Error('connect ECONNREFUSED postgresql://web_coverage:s3cret@host/db')),
    };
    const limiter = createProxyRateLimiter({ store, log });

    const result = await limiter.hit(KEY, 0, PARAMS);

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(log).toHaveBeenCalledTimes(1);
    const [line] = parsedLines(log);
    expect(line).toMatchObject({
      level: 'error',
      component: 'proxy-limiter',
      msg: 'store-unavailable',
      reason: 'error',
    });
    expect(typeof line?.ts).toBe('string');
    const raw = String(log.mock.calls[0]?.[0]);
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain('postgresql');
    expect(raw).not.toContain('s3cret');
    expect(raw).not.toContain('ECONNREFUSED');
  });

  it('un almacén más lento de 200 ms se abandona EXACTAMENTE a los 200 ms: permite y registra reason "timeout"', async () => {
    const log = vi.fn();
    const store: ProxyRateLimitStore = { hit: () => new Promise<FixedWindowState>(() => undefined) };
    const limiter = createProxyRateLimiter({ store, log });
    let settled = false;
    const pending = limiter.hit(KEY, 0, PARAMS).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(settled).toBe(true);
    expect(parsedLines(log)).toEqual([
      expect.objectContaining({ component: 'proxy-limiter', msg: 'store-unavailable', reason: 'timeout' }),
    ]);
  });

  it('un almacén que contesta a tiempo no deja temporizadores vivos ni registra nada', async () => {
    const log = vi.fn();
    const limiter = createProxyRateLimiter({ store: memoryStore(), log });

    await limiter.hit(KEY, 0, PARAMS);

    expect(vi.getTimerCount()).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('el rechazo TARDÍO de una consulta ya abandonada no escapa como promesa sin manejar', async () => {
    const log = vi.fn();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const store: ProxyRateLimitStore = {
        hit: () =>
          new Promise<FixedWindowState>((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('late failure'));
            }, 300);
          }),
      };
      const limiter = createProxyRateLimiter({ store, log });
      const pending = limiter.hit(KEY, 0, PARAMS);

      await vi.advanceTimersByTimeAsync(200);
      await pending;
      await vi.advanceTimersByTimeAsync(500);

      expect(unhandled).not.toHaveBeenCalled();
      // Sigue habiendo una sola línea: el fallo tardío no es un segundo evento.
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('el plazo es configurable y por defecto 200 ms', async () => {
    const store: ProxyRateLimitStore = { hit: () => new Promise<FixedWindowState>(() => undefined) };
    const limiter = createProxyRateLimiter({ store, log: vi.fn(), deadlineMs: 50 });
    const pending = limiter.hit(KEY, 0, PARAMS);

    await vi.advanceTimersByTimeAsync(50);

    expect(await pending).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('el registro se limita a una línea cada 10 s por instancia', async () => {
    const log = vi.fn();
    const store: ProxyRateLimitStore = { hit: () => Promise.reject(new Error('down')) };
    const limiter = createProxyRateLimiter({ store, log });

    await limiter.hit(KEY, 0, PARAMS);
    await limiter.hit(KEY, 0, PARAMS);
    await vi.advanceTimersByTimeAsync(9_999);
    await limiter.hit(KEY, 0, PARAMS);
    expect(log).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await limiter.hit(KEY, 0, PARAMS);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('el estrangulado de registros no depende de la razón: error y timeout comparten la misma ventana de 10 s', async () => {
    const log = vi.fn();
    let fail = true;
    const store: ProxyRateLimitStore = {
      hit: () => (fail ? Promise.reject(new Error('down')) : new Promise<FixedWindowState>(() => undefined)),
    };
    const limiter = createProxyRateLimiter({ store, log });

    await limiter.hit(KEY, 0, PARAMS);
    fail = false;
    const pending = limiter.hit(KEY, 0, PARAMS);
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(parsedLines(log).map((line) => line.reason)).toEqual(['error']);
  });
});

// ROADMAP 3.4 (decisión 258, D16; R6.5) — latido (dead-man's-switch): tras un tick correcto, un GET a
// `HEARTBEAT_URL` como mucho cada `HEARTBEAT_MIN_INTERVAL_MS`, contado en el presupuesto de salida del tick,
// con tiempo límite explícito y sin que un fallo sea nunca fatal. HTTP falso: ningún endpoint real.
import { describe, expect, it } from 'vitest';

import { createHeartbeat } from '../src/ops/heartbeat.js';
import type { HeartbeatFetch } from '../src/ops/heartbeat.js';
import { createJsonLogger } from '../src/ops/json-logger.js';
import { createOutboundBudget } from '../src/ops/outbound-budget.js';

const URL_SECRET = 'https://hc-ping.example/3f2a9c-uuid-privado';

interface Setup {
  readonly requests: { readonly url: string; readonly init: Parameters<HeartbeatFetch>[1] }[];
  readonly events: Record<string, unknown>[];
  readonly lines: string[];
  clock: { value: number };
  readonly heartbeat: ReturnType<typeof createHeartbeat>;
}

function setup(
  overrides: {
    readonly url?: string | undefined;
    readonly minIntervalMs?: number;
    readonly timeoutMs?: number;
    readonly fetchFn?: HeartbeatFetch;
  } = {}
): Setup {
  const requests: { url: string; init: Parameters<HeartbeatFetch>[1] }[] = [];
  const events: Record<string, unknown>[] = [];
  const lines: string[] = [];
  const clock = { value: 1_000_000 };
  const log = createJsonLogger({
    component: 'coverage-worker',
    write: (line) => {
      lines.push(line);
      events.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  const okFetch: HeartbeatFetch = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve({ ok: true, status: 200 });
  };
  const heartbeat = createHeartbeat({
    url: 'url' in overrides ? overrides.url : URL_SECRET,
    minIntervalMs: overrides.minIntervalMs ?? 60_000,
    timeoutMs: overrides.timeoutMs ?? 5000,
    fetchFn: overrides.fetchFn ?? okFetch,
    now: () => clock.value,
    log,
  });
  return { requests, events, lines, clock, heartbeat };
}

describe('createHeartbeat — sin URL', () => {
  it('HEARTBEAT_URL sin definir: no hay ninguna llamada ni se toma ninguna plaza del presupuesto', async () => {
    const s = setup({ url: undefined });
    const budget = createOutboundBudget(4);

    await s.heartbeat.afterSuccessfulTick(budget);

    expect(s.requests).toHaveLength(0);
    expect(budget.remaining()).toBe(4);
  });
});

describe('createHeartbeat — ping tras un tick correcto', () => {
  it('hace un GET a la URL configurada, sin seguir redirecciones, con señal de tiempo límite, y toma UNA plaza', async () => {
    const s = setup();
    const budget = createOutboundBudget(4);

    await s.heartbeat.afterSuccessfulTick(budget);

    expect(s.requests).toHaveLength(1);
    expect(s.requests[0]?.url).toBe(URL_SECRET);
    expect(s.requests[0]?.init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(s.requests[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(budget.remaining()).toBe(3);
  });

  it('el éxito no ensucia el registro (un latido por minuto no genera líneas)', async () => {
    const s = setup();

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));

    expect(s.lines).toHaveLength(0);
  });
});

describe('createHeartbeat — intervalo mínimo', () => {
  it('no vuelve a llamar antes de HEARTBEAT_MIN_INTERVAL_MS y sí al alcanzarlo', async () => {
    const s = setup({ minIntervalMs: 60_000 });

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    s.clock.value += 59_999;
    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    expect(s.requests).toHaveLength(1);

    s.clock.value += 1;
    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    expect(s.requests).toHaveLength(2);
  });

  it('con intervalo 0 (tests) hay un latido por tick correcto', async () => {
    const s = setup({ minIntervalMs: 0 });

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));

    expect(s.requests).toHaveLength(3);
  });

  it('un intento FALLIDO también cuenta como último intento (no se martillea al monitor caído)', async () => {
    let calls = 0;
    const counting: HeartbeatFetch = () => {
      calls += 1;
      return Promise.reject(new Error('ECONNRESET'));
    };
    const failing = setup({ fetchFn: counting, minIntervalMs: 60_000 });

    await failing.heartbeat.afterSuccessfulTick(createOutboundBudget(4));
    failing.clock.value += 30_000;
    await failing.heartbeat.afterSuccessfulTick(createOutboundBudget(4));

    expect(calls).toBe(1);
  });
});

describe('createHeartbeat — presupuesto de salida (cuenta para el tope por tick)', () => {
  it('sin plazas no llama, y eso NO consume el intervalo: el siguiente tick con plaza sí late', async () => {
    const s = setup({ minIntervalMs: 60_000 });

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(0));
    expect(s.requests).toHaveLength(0);

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(1));
    expect(s.requests).toHaveLength(1);
  });

  it('con una plaza, un solo ping aunque el gancho se invoque dos veces en el mismo tick', async () => {
    const s = setup({ minIntervalMs: 0 });
    const budget = createOutboundBudget(1);

    await s.heartbeat.afterSuccessfulTick(budget);
    await s.heartbeat.afterSuccessfulTick(budget);

    expect(s.requests).toHaveLength(1);
  });
});

describe('createHeartbeat — fallos no fatales y sin secretos', () => {
  it('una excepción de red se registra como warn y la promesa NO rechaza; la URL no aparece en el registro', async () => {
    const s = setup({ fetchFn: () => Promise.reject(new Error(`getaddrinfo ENOTFOUND ${URL_SECRET}`)) });

    await expect(s.heartbeat.afterSuccessfulTick(createOutboundBudget(4))).resolves.toBeUndefined();

    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ level: 'warn', msg: 'heartbeat-failed', reason: 'error' });
    expect(s.lines.join('\n')).not.toContain('uuid-privado');
  });

  it('una respuesta HTTP no correcta se registra con su estado y tampoco rechaza', async () => {
    const s = setup({ fetchFn: () => Promise.resolve({ ok: false, status: 503 }) });

    await expect(s.heartbeat.afterSuccessfulTick(createOutboundBudget(4))).resolves.toBeUndefined();

    expect(s.events[0]).toMatchObject({ level: 'warn', msg: 'heartbeat-failed', reason: 'http', status: 503 });
  });

  it('si el monitor no responde, la llamada se aborta al cumplirse el tiempo límite y se registra como timeout', async () => {
    const hanging: HeartbeatFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'TimeoutError'));
        });
      });
    const s = setup({ fetchFn: hanging, timeoutMs: 20 });

    await s.heartbeat.afterSuccessfulTick(createOutboundBudget(4));

    expect(s.events[0]).toMatchObject({ level: 'warn', msg: 'heartbeat-failed', reason: 'timeout', timeout_ms: 20 });
  });
});

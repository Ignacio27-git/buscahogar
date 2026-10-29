// ROADMAP 3.4 (decisión 259, D17; R7.1, R7.4, R7.6) — notificador de Telegram (Bot API `sendMessage` por HTTPS):
// separación mínima por chat, tiempo límite explícito, fallos que nunca lanzan y token que nunca llega a un
// registro ni a un error. HTTP FALSO inyectado: ningún test habla con la API real de Telegram.
import { describe, expect, it } from 'vitest';

import { createTelegramNotifier, TELEGRAM_API_BASE_URL } from '../src/alerts/telegram-notifier.js';
import type { TelegramFetch } from '../src/alerts/telegram-notifier.js';
import { createJsonLogger } from '../src/ops/json-logger.js';

const TOKEN = '123456789:AAE-secret_token_value';
const CHAT_ID = '-1001234567890';

interface Recorded {
  readonly url: string;
  readonly init: Parameters<TelegramFetch>[1];
}

interface Setup {
  readonly requests: Recorded[];
  readonly lines: string[];
  readonly sleeps: number[];
  readonly clock: { value: number };
  readonly notifier: ReturnType<typeof createTelegramNotifier>;
}

function setup(
  overrides: {
    readonly fetchFn?: (recorded: Recorded[]) => TelegramFetch;
    readonly timeoutMs?: number;
    readonly baseUrl?: string;
  } = {}
): Setup {
  const requests: Recorded[] = [];
  const lines: string[] = [];
  const sleeps: number[] = [];
  const clock = { value: 1_000_000 };
  const log = createJsonLogger({
    component: 'coverage-worker',
    redact: [TOKEN, CHAT_ID],
    write: (line) => lines.push(line),
  });
  const okFetch: TelegramFetch = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve({ ok: true, status: 200 });
  };
  const notifier = createTelegramNotifier({
    botToken: TOKEN,
    chatId: CHAT_ID,
    ...(overrides.baseUrl !== undefined ? { baseUrl: overrides.baseUrl } : {}),
    fetchFn: overrides.fetchFn ? overrides.fetchFn(requests) : okFetch,
    sleep: (ms) => {
      sleeps.push(ms);
      clock.value += ms;
      return Promise.resolve();
    },
    now: () => clock.value,
    timeoutMs: overrides.timeoutMs ?? 5000,
    minSpacingMs: 1000,
    log,
  });
  return { requests, lines, sleeps, clock, notifier };
}

describe('createTelegramNotifier — petición', () => {
  it('hace un POST JSON a /bot<token>/sendMessage con chat_id y texto, sin seguir redirecciones', async () => {
    const s = setup();

    const ok = await s.notifier.send('Hola mundo');

    expect(ok).toBe(true);
    expect(s.requests).toHaveLength(1);
    const [request] = s.requests;
    expect(request?.url).toBe(`${TELEGRAM_API_BASE_URL}/bot${TOKEN}/sendMessage`);
    expect(request?.init.method).toBe('POST');
    expect(request?.init.redirect).toBe('error');
    expect(request?.init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(request?.init.body ?? '{}')).toEqual({
      chat_id: CHAT_ID,
      text: 'Hola mundo',
      disable_web_page_preview: true,
    });
    expect(request?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('el HTTPS es el de Telegram por defecto; una base distinta (solo para el HTTP falso) se respeta', async () => {
    expect(TELEGRAM_API_BASE_URL.startsWith('https://')).toBe(true);
    const s = setup({ baseUrl: 'http://127.0.0.1:9999' });
    await s.notifier.send('x');
    expect(s.requests[0]?.url).toBe(`http://127.0.0.1:9999/bot${TOKEN}/sendMessage`);
  });

  it('un envío correcto no escribe ninguna línea de registro', async () => {
    const s = setup();
    await s.notifier.send('x');
    expect(s.lines).toEqual([]);
  });
});

describe('createTelegramNotifier — separación mínima por chat (>= 1000 ms)', () => {
  it('el primer envío no espera; los siguientes esperan lo que falte hasta 1000 ms desde el anterior', async () => {
    const s = setup();

    await s.notifier.send('a');
    await s.notifier.send('b');
    s.clock.value += 400;
    await s.notifier.send('c');

    expect(s.sleeps).toEqual([1000, 600]);
    expect(s.requests).toHaveLength(3);
  });

  it('si ya pasó el intervalo no espera', async () => {
    const s = setup();
    await s.notifier.send('a');
    s.clock.value += 5000;

    await s.notifier.send('b');

    expect(s.sleeps).toEqual([]);
  });

  it('la separación cuenta también tras un envío fallido (no se martillea a la API)', async () => {
    const s = setup({
      fetchFn: (recorded) => (url, init): ReturnType<TelegramFetch> => {
        recorded.push({ url, init });
        return Promise.resolve({ ok: false, status: 500 });
      },
    });

    await s.notifier.send('a');
    await s.notifier.send('b');

    expect(s.sleeps).toEqual([1000]);
  });
});

describe('createTelegramNotifier — fallos (R7.6)', () => {
  it('HTTP 500: devuelve false, no lanza y registra solo el estado', async () => {
    const s = setup({
      fetchFn: (recorded) => (url, init): ReturnType<TelegramFetch> => {
        recorded.push({ url, init });
        return Promise.resolve({ ok: false, status: 500 });
      },
    });

    const ok = await s.notifier.send('secreto-en-el-texto');

    expect(ok).toBe(false);
    const events = s.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: 'warn', msg: 'alert-send-failed', reason: 'http', status: 500 });
    expect(s.lines.join('\n')).not.toContain('secreto-en-el-texto');
  });

  it('una caída de red cuyo mensaje contiene el token: no se propaga ni se registra', async () => {
    const s = setup({
      fetchFn: () => (): ReturnType<TelegramFetch> =>
        Promise.reject(new Error(`getaddrinfo ENOTFOUND api.telegram.org (https://api.telegram.org/bot${TOKEN}/sendMessage)`)),
    });

    const ok = await s.notifier.send('x');

    expect(ok).toBe(false);
    const output = s.lines.join('\n');
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain('AAE-secret_token_value');
    expect(output).not.toContain(CHAT_ID);
    expect(JSON.parse(s.lines[0] ?? '{}')).toMatchObject({ msg: 'alert-send-failed', reason: 'error' });
  });

  it('si la composición NO registró el token en el logger, el notificador lo elimina por su cuenta', async () => {
    const lines: string[] = [];
    const bareLog = createJsonLogger({ component: 'coverage-worker', write: (line) => lines.push(line) });
    const notifier = createTelegramNotifier({
      botToken: TOKEN,
      chatId: CHAT_ID,
      fetchFn: () => Promise.reject(new Error(`boom ${TOKEN} y ${CHAT_ID}`)),
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 5000,
      minSpacingMs: 1000,
      log: bareLog,
    });

    await notifier.send('x');

    expect(lines.join('\n')).not.toContain(TOKEN);
    expect(lines.join('\n')).not.toContain(CHAT_ID);
    expect(lines.join('\n')).toContain('boom');
  });

  it('tiempo límite explícito: una petición colgada se aborta, devuelve false y registra timeout', async () => {
    const s = setup({
      timeoutMs: 20,
      fetchFn: () => (_url, init): ReturnType<TelegramFetch> =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted due to timeout');
            error.name = 'TimeoutError';
            reject(error);
          });
        }),
    });

    const started = Date.now();
    const ok = await s.notifier.send('x');

    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(JSON.parse(s.lines[0] ?? '{}')).toMatchObject({
      msg: 'alert-send-failed',
      reason: 'timeout',
      timeout_ms: 20,
    });
  });

  it('un fallo no altera el siguiente envío: sigue funcionando', async () => {
    let call = 0;
    const s = setup({
      fetchFn: (recorded) => (url, init): ReturnType<TelegramFetch> => {
        recorded.push({ url, init });
        call += 1;
        return Promise.resolve(call === 1 ? { ok: false, status: 502 } : { ok: true, status: 200 });
      },
    });

    expect(await s.notifier.send('a')).toBe(false);
    expect(await s.notifier.send('b')).toBe(true);
  });
});

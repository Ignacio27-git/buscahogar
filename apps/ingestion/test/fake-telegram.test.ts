// ROADMAP 3.4 (decisión 259, D17; R7.1, R7.6) — Telegram FALSO (`scripts/fake-telegram.ts`): un servidor HTTP en
// el bucle local que imita `POST /bot<token>/sendMessage`. Aquí se prueba con HTTP real contra 127.0.0.1 (ninguna
// petición sale de la máquina) y el notificador REAL de producción: es el banco de pruebas de R7.4/R7.6.
import { afterEach, describe, expect, it } from 'vitest';

import { startFakeTelegram } from '../scripts/fake-telegram.js';
import type { FakeTelegram } from '../scripts/fake-telegram.js';
import { createTelegramNotifier, TELEGRAM_TIMEOUT_MS } from '../src/alerts/telegram-notifier.js';
import type { TelegramNotifier } from '../src/alerts/telegram-notifier.js';
import { createJsonLogger } from '../src/ops/json-logger.js';
import { loopbackFetch } from './helpers/loopback-fetch.js';

const TOKEN = '123456789:AAE-secret_token_value';
const CHAT_ID = '-1001234567890';

const running: FakeTelegram[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((fake) => fake.close()));
});

async function start(mode?: 'ok' | 'error500' | 'hang'): Promise<FakeTelegram> {
  const fake = await startFakeTelegram(mode === undefined ? {} : { mode });
  running.push(fake);
  return fake;
}

function notifierFor(fake: FakeTelegram, lines: string[], timeoutMs = TELEGRAM_TIMEOUT_MS): TelegramNotifier {
  return createTelegramNotifier({
    botToken: TOKEN,
    chatId: CHAT_ID,
    baseUrl: fake.url,
    fetchFn: (url, init) => loopbackFetch(url, init),
    sleep: () => Promise.resolve(),
    now: () => Date.now(),
    timeoutMs,
    minSpacingMs: 0,
    log: createJsonLogger({ component: 'coverage-worker', redact: [TOKEN, CHAT_ID], write: (line) => lines.push(line) }),
  });
}

describe('fake-telegram — servidor HTTP local', () => {
  it('escucha solo en el bucle local y devuelve una URL base http://127.0.0.1:<puerto>', async () => {
    const fake = await start();
    expect(fake.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('registra cada sendMessage (chat, texto) y responde como Telegram', async () => {
    const fake = await start();
    const ok = await notifierFor(fake, []).send('Cuota al 81 %');

    expect(ok).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ method: 'POST', chatId: CHAT_ID, text: 'Cuota al 81 %', tokenValid: true });
  });

  it('nunca guarda el token en lo registrado (solo si la ruta lo traía bien formado)', async () => {
    const fake = await start();
    await notifierFor(fake, []).send('x');
    expect(JSON.stringify(fake.requests)).not.toContain('AAE-secret');
  });

  it('modo error500: el notificador devuelve false, no lanza y el registro no lleva el token', async () => {
    const fake = await start('error500');
    const lines: string[] = [];

    const ok = await notifierFor(fake, lines).send('x');

    expect(ok).toBe(false);
    expect(fake.requests).toHaveLength(1);
    expect(lines.join('\n')).toContain('"status":500');
    expect(lines.join('\n')).not.toContain('AAE-secret');
  });

  it('modo hang: la petición se corta por el tiempo límite del notificador (no cuelga el tick)', async () => {
    const fake = await start('hang');
    const lines: string[] = [];
    const started = Date.now();

    const ok = await notifierFor(fake, lines, 150).send('x');

    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines.join('\n')).toContain('"reason":"timeout"');
  });

  it('el modo se puede cambiar en caliente (ok -> error500 -> ok) y reset() vacía lo registrado', async () => {
    const fake = await start();
    const notifier = notifierFor(fake, []);

    expect(await notifier.send('a')).toBe(true);
    fake.setMode('error500');
    expect(await notifier.send('b')).toBe(false);
    fake.setMode('ok');
    expect(await notifier.send('c')).toBe(true);
    expect(fake.requests.map((request) => request.text)).toEqual(['a', 'b', 'c']);

    fake.reset();
    expect(fake.requests).toEqual([]);
  });

  it('una ruta que no es /bot<token>/sendMessage responde 404 y no cuenta como mensaje', async () => {
    const fake = await start();
    const response = await loopbackFetch(`${fake.url}/otra-cosa`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(404);
    expect(fake.requests).toEqual([]);
  });
});

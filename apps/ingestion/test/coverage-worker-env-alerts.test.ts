// ROADMAP 3.4 (decisión 259, D17; R7.1, NF3) — variables de entorno de los avisos operativos del worker:
// `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` (las dos o ninguna; ausentes = avisos desactivados, el worker
// arranca igual) y los parámetros de las comprobaciones. Los mensajes de error nombran la variable y NUNCA
// repiten su valor (el token es un secreto).
import { describe, expect, it } from 'vitest';

import { readEnv, WorkerEnvError } from '../scripts/coverage-worker.js';

const BASE_ENV: Record<string, string> = {
  IDEALISTA_API_KEY: 'k',
  IDEALISTA_API_SECRET: 's',
  DATABASE_URL: 'postgresql://owner@localhost:5432/buscahogar',
  DAILY_SEARCH_CAP: '100',
  BLOCKING_RADIUS_METERS: '300',
  BLOCKING_PRICE_BAND_CENTS: '2500000',
  BLOCKING_SURFACE_TOLERANCE_M2: '10',
};
const TOKEN = '123456789:AAE-secret_token_value';

describe('readEnv — Telegram (las dos variables o ninguna)', () => {
  it('ninguna definida: avisos desactivados y valores por defecto de las comprobaciones', () => {
    const { alerts } = readEnv(BASE_ENV);

    expect(alerts.telegram).toBeUndefined();
    expect(alerts.failedJobsThreshold).toBe(5);
    expect(alerts.failedJobsWindowMs).toBe(86_400_000);
    expect(alerts.cooldownMs).toBe(21_600_000);
  });

  it('en blanco cuentan como no definidas', () => {
    const { alerts } = readEnv({ ...BASE_ENV, TELEGRAM_BOT_TOKEN: '  ', TELEGRAM_CHAT_ID: '' });
    expect(alerts.telegram).toBeUndefined();
  });

  it.each([['-1001234567890'], ['123456'], ['@canal_operativo']])('token y chat "%s" válidos se leen recortados', (chat) => {
    const { alerts } = readEnv({ ...BASE_ENV, TELEGRAM_BOT_TOKEN: ` ${TOKEN} `, TELEGRAM_CHAT_ID: ` ${chat} ` });
    expect(alerts.telegram).toEqual({ botToken: TOKEN, chatId: chat });
  });

  it('solo el token: error que nombra las dos variables y no repite el valor', () => {
    const env = { ...BASE_ENV, TELEGRAM_BOT_TOKEN: TOKEN };
    expect(() => readEnv(env)).toThrow(WorkerEnvError);
    expect(() => readEnv(env)).toThrow(/TELEGRAM_BOT_TOKEN.*TELEGRAM_CHAT_ID/);
    expect(() => readEnv(env)).not.toThrow(/AAE-secret/);
  });

  it('solo el chat: error que nombra las dos variables', () => {
    expect(() => readEnv({ ...BASE_ENV, TELEGRAM_CHAT_ID: '-100123' })).toThrow(/TELEGRAM_BOT_TOKEN.*TELEGRAM_CHAT_ID/);
  });

  it.each([['sin-formato'], ['12345'], ['123:'], [':abc'], ['123456789:con espacio']])(
    'token "%s" con formato inválido: error que nombra TELEGRAM_BOT_TOKEN sin repetir el valor',
    (token) => {
      const env = { ...BASE_ENV, TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '-100123' };
      expect(() => readEnv(env)).toThrow(/TELEGRAM_BOT_TOKEN/);
      expect(() => readEnv(env)).not.toThrow(new RegExp(token.replace(/[^\w]/g, '.')));
    }
  );

  it.each([['canal'], ['-'], ['12 34'], ['@']])('chat "%s" con formato inválido: error que nombra TELEGRAM_CHAT_ID', (chat) => {
    expect(() => readEnv({ ...BASE_ENV, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: chat })).toThrow(/TELEGRAM_CHAT_ID/);
  });
});

describe('readEnv — parámetros de las comprobaciones de avisos', () => {
  it('acepta valores válidos', () => {
    const { alerts } = readEnv({
      ...BASE_ENV,
      ALERT_FAILED_JOBS_THRESHOLD: '10',
      ALERT_FAILED_JOBS_WINDOW_MS: '3600000',
      ALERT_COOLDOWN_MS: '60000',
    });
    expect(alerts).toMatchObject({ failedJobsThreshold: 10, failedJobsWindowMs: 3_600_000, cooldownMs: 60_000 });
  });

  it.each([['0'], ['-1'], ['abc'], ['1.5'], ['']])('ALERT_FAILED_JOBS_THRESHOLD "%s" se rechaza nombrando la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, ALERT_FAILED_JOBS_THRESHOLD: raw })).toThrow(/ALERT_FAILED_JOBS_THRESHOLD/);
  });

  it.each([['59999'], ['0'], ['abc'], ['']])('ALERT_FAILED_JOBS_WINDOW_MS "%s" se rechaza nombrando variable y mínimo', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, ALERT_FAILED_JOBS_WINDOW_MS: raw })).toThrow(/ALERT_FAILED_JOBS_WINDOW_MS.*60000/);
  });

  it.each([['59999'], ['-5'], ['abc'], ['']])('ALERT_COOLDOWN_MS "%s" se rechaza nombrando variable y mínimo', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, ALERT_COOLDOWN_MS: raw })).toThrow(/ALERT_COOLDOWN_MS.*60000/);
  });
});

describe('readEnv — TELEGRAM_API_BASE_URL (solo para el Telegram falso)', () => {
  it('sin definir (o en blanco): la API real, representada como undefined', () => {
    expect(readEnv(BASE_ENV).alerts.apiBaseUrl).toBeUndefined();
    expect(readEnv({ ...BASE_ENV, TELEGRAM_API_BASE_URL: '  ' }).alerts.apiBaseUrl).toBeUndefined();
  });

  it.each([
    ['https://telegram.example.test', 'https://telegram.example.test'],
    ['https://telegram.example.test/', 'https://telegram.example.test'],
    ['http://127.0.0.1:8081', 'http://127.0.0.1:8081'],
    ['http://localhost:8081/', 'http://localhost:8081'],
  ])('"%s" válida se normaliza a "%s"', (raw, expected) => {
    expect(readEnv({ ...BASE_ENV, TELEGRAM_API_BASE_URL: raw }).alerts.apiBaseUrl).toBe(expected);
  });

  it.each([
    ['http://telegram.example.test'],
    ['ftp://127.0.0.1'],
    ['no-es-una-url'],
    ['https://user:pass@telegram.example.test'],
    ['https://telegram.example.test/ruta'],
    ['https://telegram.example.test/?x=1'],
    ['https://telegram.example.test/#frag'],
  ])('"%s" se rechaza nombrando la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, TELEGRAM_API_BASE_URL: raw })).toThrow(/TELEGRAM_API_BASE_URL/);
  });

  it('un error no repite el valor (puede llevar credenciales)', () => {
    expect(() => readEnv({ ...BASE_ENV, TELEGRAM_API_BASE_URL: 'https://user:hunter2@telegram.example.test' })).not.toThrow(
      /hunter2/
    );
  });
});

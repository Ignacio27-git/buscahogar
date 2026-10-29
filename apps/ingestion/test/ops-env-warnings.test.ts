// ROADMAP 3.4 (decisión 258 parte; D22) — clasificador de avisos de PRODUCCIÓN del worker. Solo NOMBRES de
// variable y motivos fijos, nunca valores. S8 lo generaliza (`env:check`, paridad con esta lista).
import { describe, expect, it } from 'vitest';

import { classifyWorkerEnv } from '../src/ops/env-warnings.js';

const TELEGRAM_ENV = { TELEGRAM_BOT_TOKEN: '123456789:AAE-secret_token_value', TELEGRAM_CHAT_ID: '-1001234567890' };

describe('classifyWorkerEnv — avisos de producción', () => {
  it('HEARTBEAT_URL sin definir: un aviso de producción que nombra la variable', () => {
    const issues = classifyWorkerEnv(TELEGRAM_ENV);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ name: 'HEARTBEAT_URL', severity: 'production-warning' });
    expect(issues[0]?.reason).toMatch(/latido|dead-man/i);
  });

  it('HEARTBEAT_URL en blanco cuenta como sin definir', () => {
    expect(classifyWorkerEnv({ ...TELEGRAM_ENV, HEARTBEAT_URL: '  ' }).map((issue) => issue.name)).toEqual([
      'HEARTBEAT_URL',
    ]);
  });

  it('HEARTBEAT_URL definida: ningún aviso, y su valor no se copia a ningún sitio', () => {
    const secret = 'https://hc-ping.example/uuid-privado';
    const issues = classifyWorkerEnv({ ...TELEGRAM_ENV, HEARTBEAT_URL: secret });

    expect(issues).toEqual([]);
    expect(JSON.stringify(classifyWorkerEnv({}))).not.toContain('uuid-privado');
  });

  it('Telegram sin configurar: UN aviso de producción (avisos desactivados) que nombra TELEGRAM_BOT_TOKEN', () => {
    const issues = classifyWorkerEnv({ HEARTBEAT_URL: 'https://hc-ping.example/x' });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ name: 'TELEGRAM_BOT_TOKEN', severity: 'production-warning' });
    expect(issues[0]?.reason).toMatch(/avisos/i);
  });

  it('Telegram en blanco cuenta como sin configurar; configurado, sin aviso y sin copiar el token', () => {
    const base = { HEARTBEAT_URL: 'https://hc-ping.example/x' };

    expect(classifyWorkerEnv({ ...base, TELEGRAM_BOT_TOKEN: ' ', TELEGRAM_CHAT_ID: '' }).map((i) => i.name)).toEqual([
      'TELEGRAM_BOT_TOKEN',
    ]);
    expect(classifyWorkerEnv({ ...base, ...TELEGRAM_ENV })).toEqual([]);
    expect(JSON.stringify(classifyWorkerEnv({}))).not.toContain('AAE-secret');
  });

  it('sin nada configurado devuelve los dos avisos, en orden estable', () => {
    expect(classifyWorkerEnv({}).map((issue) => issue.name)).toEqual(['HEARTBEAT_URL', 'TELEGRAM_BOT_TOKEN']);
  });
});

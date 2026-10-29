// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2) — clasificador de entorno de apps/ingestion. Una sola lista de
// problemas (`error` y `production-warning`) por servicio (worker, despliegue) que comparten el arranque del
// worker y `env:check`. Usa los lectores REALES (`readEnv`, `readDeployConfig`): lo que el runtime rechaza, el
// clasificador lo marca; solo salen NOMBRES de variable y motivos fijos, jamás valores.
import { describe, expect, it } from 'vitest';

import { readDeployConfig } from '../src/deploy/deploy-env.js';
import {
  classifyEnv,
  envCheckExitCode,
  parseEnvCheckArgs,
  renderEnvReport,
} from '../src/ops/env-classifier.js';
import type { EnvIssue, EnvReaders } from '../src/ops/env-classifier.js';
import { classifyWorkerEnv } from '../src/ops/env-warnings.js';
import { readEnv } from '../scripts/coverage-worker.js';

const READERS: EnvReaders = {
  worker: (env) => {
    readEnv(env);
  },
  deploy: (env) => {
    const result = readDeployConfig(env);
    return result.ok ? [] : result.issues;
  },
};

const WORKER_ENV = {
  IDEALISTA_API_KEY: 'clave-idealista-privada',
  IDEALISTA_API_SECRET: 'secreto-idealista-privado',
  DATABASE_URL: 'postgresql://owner:secreto-bd@db.example.test/buscahogar',
  DAILY_SEARCH_CAP: '100',
  BLOCKING_RADIUS_METERS: '150',
  BLOCKING_PRICE_BAND_CENTS: '2000000',
  BLOCKING_SURFACE_TOLERANCE_M2: '10',
  HEARTBEAT_URL: 'https://hc-ping.example/uuid-privado',
  TELEGRAM_BOT_TOKEN: '123456789:AAE-token_privado_largo',
  TELEGRAM_CHAT_ID: '-1001234567890',
} as const;

const DEPLOY_ENV = {
  DIRECT_DATABASE_URL: 'postgresql://owner:secreto-directo@db.example.test/buscahogar',
  WEB_READONLY_PASSWORD: 'secreto-readonly',
  WEB_COVERAGE_PASSWORD: 'secreto-coverage',
} as const;

// Copia del entorno sin una variable (para probar que su ausencia se nombra).
function omit(source: Readonly<Record<string, string>>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== name));
}

function names(issues: readonly EnvIssue[], severity: EnvIssue['severity']): string[] {
  return issues.filter((issue) => issue.severity === severity).map((issue) => issue.name);
}

describe('classifyEnv (ingestion, worker) — errores', () => {
  it('entorno completo: ni errores ni avisos', () => {
    expect(classifyEnv(WORKER_ENV, 'production', 'worker', READERS)).toEqual([]);
    expect(classifyEnv(WORKER_ENV, 'local', 'worker', READERS)).toEqual([]);
  });

  it('entorno vacío: nombra las siete obligatorias, una a una, como ausentes', () => {
    const issues = classifyEnv({}, 'local', 'worker', READERS);

    expect(names(issues, 'error')).toEqual([
      'IDEALISTA_API_KEY',
      'IDEALISTA_API_SECRET',
      'DATABASE_URL',
      'DAILY_SEARCH_CAP',
      'BLOCKING_RADIUS_METERS',
      'BLOCKING_PRICE_BAND_CENTS',
      'BLOCKING_SURFACE_TOLERANCE_M2',
    ]);
    expect(issues.every((issue) => /falta/i.test(issue.reason))).toBe(true);
  });

  it('una variable en blanco cuenta como ausente', () => {
    expect(names(classifyEnv({ ...WORKER_ENV, DAILY_SEARCH_CAP: '  ' }, 'local', 'worker', READERS), 'error')).toEqual([
      'DAILY_SEARCH_CAP',
    ]);
  });

  it.each([
    ['DAILY_SEARCH_CAP', 'cero'],
    ['BLOCKING_RADIUS_METERS', '-3'],
    ['POLL_INTERVAL_MS', 'rápido'],
    ['REFRESH_BUDGET_FRACTION', '7'],
    ['WORKER_STOP_GRACE_MS', '0'],
    ['STALE_RUNNING_JOB_AFTER_MS', '5000'],
    ['HEARTBEAT_URL', 'http://inseguro.example/x'],
    ['ALERT_FAILED_JOBS_THRESHOLD', '0'],
    ['TELEGRAM_BOT_TOKEN', 'no-es-un-token'],
    ['TELEGRAM_API_BASE_URL', 'http://publico.example'],
  ])('%s inválida: error que la nombra y no repite el valor', (name, value) => {
    const issues = classifyEnv({ ...WORKER_ENV, [name]: value }, 'local', 'worker', READERS);

    expect(names(issues, 'error')).toContain(name);
    expect(issues.find((issue) => issue.name === name)?.reason).toMatch(/inválid/i);
    expect(JSON.stringify(issues)).not.toContain(value);
  });

  it('Telegram a medias (solo el token): nombra las dos variables del par', () => {
    const tokenOnly = omit(WORKER_ENV, 'TELEGRAM_CHAT_ID');

    expect(names(classifyEnv(tokenOnly, 'local', 'worker', READERS), 'error')).toEqual([
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
    ]);
  });

  it('OPERATION (retirada) se señala por su nombre', () => {
    expect(names(classifyEnv({ ...WORKER_ENV, OPERATION: 'sale' }, 'local', 'worker', READERS), 'error')).toEqual([
      'OPERATION',
    ]);
  });

  it('ningún valor de configuración aparece en la lista, válido o no', () => {
    const everything = JSON.stringify(
      classifyEnv({ ...WORKER_ENV, DAILY_SEARCH_CAP: 'valor-malo-xyz', HEARTBEAT_URL: undefined }, 'production', 'worker', READERS)
    );
    for (const secret of [
      'clave-idealista-privada',
      'secreto-idealista-privado',
      'secreto-bd',
      'valor-malo-xyz',
      'AAE-token_privado_largo',
      '-1001234567890',
    ]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe('classifyEnv (ingestion, worker) — avisos de producción y paridad con el runtime', () => {
  const CASES: ReadonlyArray<readonly [string, Record<string, string | undefined>]> = [
    ['todo configurado', WORKER_ENV],
    ['sin latido', { ...WORKER_ENV, HEARTBEAT_URL: undefined }],
    ['latido en blanco', { ...WORKER_ENV, HEARTBEAT_URL: '  ' }],
    ['sin Telegram', { ...WORKER_ENV, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }],
    ['sin nada opcional', {
      IDEALISTA_API_KEY: 'k', IDEALISTA_API_SECRET: 's', DATABASE_URL: 'u', DAILY_SEARCH_CAP: '1',
      BLOCKING_RADIUS_METERS: '1', BLOCKING_PRICE_BAND_CENTS: '1', BLOCKING_SURFACE_TOLERANCE_M2: '1',
    }],
  ];

  it.each(CASES)('%s: los avisos de producción son EXACTAMENTE los que registra el worker al arrancar', (_label, env) => {
    const runtime = classifyWorkerEnv(env).map((issue) => `${issue.name}|${issue.reason}`);
    const check = classifyEnv(env, 'production', 'worker', READERS)
      .filter((issue) => issue.severity === 'production-warning')
      .map((issue) => `${issue.name}|${issue.reason}`);

    expect(check).toEqual(runtime);
  });

  it('sin latido ni Telegram, producción nombra HEARTBEAT_URL y TELEGRAM_BOT_TOKEN; local ninguno', () => {
    const env = { ...WORKER_ENV, HEARTBEAT_URL: undefined, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined };

    expect(names(classifyEnv(env, 'production', 'worker', READERS), 'production-warning')).toEqual([
      'HEARTBEAT_URL',
      'TELEGRAM_BOT_TOKEN',
    ]);
    expect(names(classifyEnv(env, 'local', 'worker', READERS), 'production-warning')).toEqual([]);
  });
});

describe('classifyEnv (ingestion, deploy)', () => {
  it('entorno completo: sin problemas, también en producción (el despliegue no tiene avisos)', () => {
    expect(classifyEnv(DEPLOY_ENV, 'production', 'deploy', READERS)).toEqual([]);
  });

  it('falta la URL directa: la nombra, aunque DATABASE_URL esté definida (no hay respaldo)', () => {
    const withoutDirect = omit(DEPLOY_ENV, 'DIRECT_DATABASE_URL');

    const issues = classifyEnv({ ...withoutDirect, DATABASE_URL: 'postgresql://pooler.example.test/db' }, 'local', 'deploy', READERS);

    expect(names(issues, 'error')).toEqual(['DIRECT_DATABASE_URL']);
    expect(issues[0]?.reason).toMatch(/falta/i);
    expect(JSON.stringify(issues)).not.toContain('pooler.example.test');
  });

  it('entorno vacío: las tres obligatorias, en orden estable', () => {
    expect(names(classifyEnv({}, 'local', 'deploy', READERS), 'error')).toEqual([
      'DIRECT_DATABASE_URL',
      'WEB_READONLY_PASSWORD',
      'WEB_COVERAGE_PASSWORD',
    ]);
  });

  it('un nombre de rol inválido se nombra sin repetir el valor', () => {
    const issues = classifyEnv({ ...DEPLOY_ENV, WEB_READONLY_ROLE: 'Rol Con Espacios' }, 'local', 'deploy', READERS);

    expect(names(issues, 'error')).toEqual(['WEB_READONLY_ROLE']);
    expect(JSON.stringify(issues)).not.toContain('Rol Con Espacios');
  });

  it('la siembra de cuota a medias nombra la variable que falta, no las dos', () => {
    expect(
      names(classifyEnv({ ...DEPLOY_ENV, SEED_MONTHLY_QUOTA_TOTAL: '1000' }, 'local', 'deploy', READERS), 'error')
    ).toEqual(['SEED_MONTHLY_QUOTA_RESERVE']);
    expect(
      names(classifyEnv({ ...DEPLOY_ENV, SEED_MONTHLY_QUOTA_RESERVE: '10' }, 'local', 'deploy', READERS), 'error')
    ).toEqual(['SEED_MONTHLY_QUOTA_TOTAL']);
  });

  it('los secretos y las URL no se copian a la lista', () => {
    const everything = JSON.stringify(classifyEnv({ ...DEPLOY_ENV, DIRECT_DATABASE_URL: 'no-es-una-url' }, 'production', 'deploy', READERS));
    expect(everything).not.toContain('no-es-una-url');
    expect(everything).not.toContain('secreto-readonly');
  });
});

describe('env:check — código de salida, informe y argumentos', () => {
  const warning: EnvIssue = { name: 'HEARTBEAT_URL', severity: 'production-warning', reason: 'motivo fijo' };
  const error: EnvIssue = { name: 'DATABASE_URL', severity: 'error', reason: 'falta o está en blanco' };

  it('local: sale 1 solo con errores; producción: también con avisos', () => {
    expect(envCheckExitCode([], 'local')).toBe(0);
    expect(envCheckExitCode([warning], 'local')).toBe(0);
    expect(envCheckExitCode([error], 'local')).toBe(1);
    expect(envCheckExitCode([], 'production')).toBe(0);
    expect(envCheckExitCode([warning], 'production')).toBe(1);
    expect(envCheckExitCode([error, warning], 'production')).toBe(1);
  });

  it('el informe lista nombre y motivo, y un resumen cuando todo está bien', () => {
    const report = renderEnvReport([error, warning], 'production', 'worker');
    expect(report).toContain('DATABASE_URL');
    expect(report).toContain('HEARTBEAT_URL');
    expect(report).toContain('falta o está en blanco');
    expect(renderEnvReport([], 'local', 'deploy')).toMatch(/sin problemas/i);
  });

  it('argumentos: por defecto local + worker; --target y --service en las dos formas', () => {
    expect(parseEnvCheckArgs([])).toEqual({ target: 'local', service: 'worker' });
    expect(parseEnvCheckArgs(['--target', 'production', '--service', 'deploy'])).toEqual({
      target: 'production',
      service: 'deploy',
    });
    expect(parseEnvCheckArgs(['--', '--service=deploy', '--target=production'])).toEqual({
      target: 'production',
      service: 'deploy',
    });
  });

  it('un destino o servicio desconocido, o un argumento extraño, no se adivinan: null', () => {
    expect(parseEnvCheckArgs(['--target', 'staging'])).toBeNull();
    expect(parseEnvCheckArgs(['--service', 'backup'])).toBeNull();
    expect(parseEnvCheckArgs(['--target'])).toBeNull();
    expect(parseEnvCheckArgs(['--verbose'])).toBeNull();
  });
});

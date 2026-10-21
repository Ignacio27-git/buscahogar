// ROADMAP 3.4 (decisión 256, D6/D5; R2.1, PD9) — cada handle de base de datos de apps/web fija su
// tamaño de pool: lectura 5, escritura restringida 2 y limitador del proxy 4 con plazos de 150 ms.
// Detrás del pooler (Neon `-pooler`) un pool grande por instancia agotaría las conexiones.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDb = vi.hoisted(() => vi.fn((_url: string, _options?: unknown) => ({ db: {}, pool: {} })));

vi.mock('@buscahogar/db', () => ({ createDb }));

import { getCoverageDb } from '../src/server/coverage-db.js';
import { getDb } from '../src/server/db.js';
import { getProxyLimiterDb } from '../src/server/proxy-limiter-db.js';

const GLOBAL_KEYS = ['buscahogarDb', 'buscahogarCoverageDb', 'buscahogarProxyLimiterDb'] as const;

function clearGlobals(): void {
  const globals = globalThis as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    Reflect.deleteProperty(globals, key);
  }
}

describe('opciones de pool de los handles de apps/web (decisión 256)', () => {
  beforeEach(() => {
    createDb.mockClear();
    clearGlobals();
    vi.stubEnv('DATABASE_URL', 'postgresql://readonly@pooler.example/db');
    vi.stubEnv('WEB_COVERAGE_DATABASE_URL', 'postgresql://coverage@pooler.example/db');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearGlobals();
  });

  it('getDb (rol de solo lectura): max 5', () => {
    getDb();

    expect(createDb).toHaveBeenCalledTimes(1);
    expect(createDb).toHaveBeenCalledWith('postgresql://readonly@pooler.example/db', { max: 5 });
  });

  it('getCoverageDb (web_coverage, registro de cobertura): max 2', () => {
    getCoverageDb();

    expect(createDb).toHaveBeenCalledWith('postgresql://coverage@pooler.example/db', { max: 2 });
  });

  it('getProxyLimiterDb (web_coverage, limitador): max 4, acquire 150 ms y consulta 150 ms', () => {
    getProxyLimiterDb();

    expect(createDb).toHaveBeenCalledWith('postgresql://coverage@pooler.example/db', {
      max: 4,
      connectionTimeoutMillis: 150,
      query_timeout: 150,
    });
  });

  it('cada handle se cachea en su propia clave global: llamar dos veces crea un solo pool', () => {
    getProxyLimiterDb();
    getProxyLimiterDb();
    getDb();
    getDb();

    expect(createDb).toHaveBeenCalledTimes(2);
    expect((globalThis as Record<string, unknown>).buscahogarProxyLimiterDb).toBeDefined();
    expect((globalThis as Record<string, unknown>).buscahogarCoverageDb).toBeUndefined();
  });
});

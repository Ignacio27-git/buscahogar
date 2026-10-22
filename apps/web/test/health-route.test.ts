// ROADMAP 3.4 (decisión 263, D8; R4.1-R4.3) — GET /api/health: `select 1` con la credencial de solo
// lectura y un plazo corto. El cuerpo es EXACTAMENTE `{status:"ok"}` (200) o `{status:"degraded"}`
// (503): ni versión, ni entorno, ni host, ni detalle del error. Nunca se cachea.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pingDatabase = vi.fn<(db: unknown) => Promise<void>>();
const getDb = vi.fn<() => unknown>();

vi.mock('@buscahogar/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@buscahogar/db')>();
  return { ...original, pingDatabase: (db: unknown): Promise<void> => pingDatabase(db) };
});
vi.mock('@/server/db', () => ({ getDb: (): unknown => getDb() }));

import * as healthRoute from '../src/app/api/health/route.js';
import { HEALTH_TIMEOUT_MS, runHealthCheck } from '../src/server/health.js';

const DB_HANDLE = { handle: 'db' };

beforeEach(() => {
  pingDatabase.mockReset();
  getDb.mockReset();
  getDb.mockReturnValue(DB_HANDLE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/health', () => {
  it('exporta GET y fuerza el renderizado dinámico', () => {
    expect(typeof healthRoute.GET).toBe('function');
    expect(healthRoute.dynamic).toBe('force-dynamic');
  });

  it('con la base de datos disponible responde 200 con el cuerpo exacto {status:"ok"}', async () => {
    pingDatabase.mockResolvedValue(undefined);
    const response = await healthRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"ok"}');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(pingDatabase).toHaveBeenCalledWith(DB_HANDLE);
  });

  it('si la consulta falla responde 503 con {status:"degraded"} y sin detalle del error', async () => {
    pingDatabase.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    const response = await healthRoute.GET();
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"degraded"}');
    expect(body).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|hunter2|password/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('si no hay credencial de base de datos (getDb lanza) responde 503 degradado, no 500', async () => {
    getDb.mockImplementation(() => {
      throw new Error('DATABASE_URL no está definida');
    });
    const response = await healthRoute.GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"degraded"}');
    expect(pingDatabase).not.toHaveBeenCalled();
  });

  it('si la consulta supera el plazo responde 503 degradado', async () => {
    vi.useFakeTimers();
    pingDatabase.mockImplementation(() => new Promise<void>(() => undefined));
    const pending = healthRoute.GET();
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"degraded"}');
  });
});

describe('ruta /api/health — credencial y salidas (R4.3, NF1)', () => {
  const source = readFileSync(new URL('../src/app/api/health/route.ts', import.meta.url), 'utf8');

  it('usa el handle de solo lectura (getDb), nunca el de cobertura ni el del limitador', () => {
    expect(source).toContain("from '@/server/db'");
    expect(source).not.toMatch(/coverage-db|proxy-limiter-db|getCoverageDb/);
  });

  it('no hace llamadas externas', () => {
    expect(source).not.toMatch(/\bfetch\s*\(|https?:\/\//);
  });
});

describe('runHealthCheck', () => {
  it('el plazo por defecto es de 1 s', () => {
    expect(HEALTH_TIMEOUT_MS).toBe(1000);
  });

  it('resuelve "ok" si la sonda termina antes del plazo y limpia el temporizador', async () => {
    vi.useFakeTimers();
    await expect(runHealthCheck(() => Promise.resolve(), 500)).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resuelve "degraded" justo al agotar el plazo, no antes', async () => {
    vi.useFakeTimers();
    let settled: string | null = null;
    const check = runHealthCheck(() => new Promise<void>(() => undefined), 500).then((status) => {
      settled = status;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await check;
    expect(settled).toBe('degraded');
  });

  it('resuelve "degraded" si la sonda lanza de forma síncrona', async () => {
    await expect(
      runHealthCheck(() => {
        throw new Error('boom');
      }, 500)
    ).resolves.toBe('degraded');
  });
});

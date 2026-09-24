// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage Limit",
// validador notes obs #263) — "page test asserts the next/headers mock is
// NOT called when CLIENT_IP_HEADER is unset": esta suite es la que prueba
// esa propiedad directamente sobre `coverage-client.ts` (la reordenación
// `readClientLimitConfig()` ANTES de `headers()` es lo que la garantiza).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.fn();
vi.mock('next/headers', () => ({ headers: headersMock }));

const { resolveCoverageClientLimit } = await import('../src/server/coverage-client.js');

const LIMIT_VARS = [
  'CLIENT_IP_HEADER',
  'CLIENT_IP_HMAC_KEY',
  'COVERAGE_PER_CLIENT_DAILY_CAP',
  'PROXY_RATE_LIMIT_MAX',
  'PROXY_RATE_LIMIT_WINDOW_SECONDS',
] as const;

describe('resolveCoverageClientLimit (spec #261, decisión 076/078)', () => {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of LIMIT_VARS) {
    snapshot[key] = process.env[key];
  }

  beforeEach(() => {
    headersMock.mockReset();
    for (const key of LIMIT_VARS) {
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    for (const key of LIMIT_VARS) {
      if (snapshot[key] === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = snapshot[key];
      }
    }
  });

  it('devuelve null cuando CLIENT_IP_HEADER no está definida, SIN llamar a next/headers', async () => {
    const result = await resolveCoverageClientLimit();
    expect(result).toBeNull();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('devuelve {keyHash, dailyCap} cuando está habilitado, y SÍ llama a next/headers', async () => {
    process.env.CLIENT_IP_HEADER = 'x-forwarded-for';
    process.env.CLIENT_IP_HMAC_KEY = 'a'.repeat(32);
    process.env.COVERAGE_PER_CLIENT_DAILY_CAP = '5';
    process.env.PROXY_RATE_LIMIT_MAX = '10';
    process.env.PROXY_RATE_LIMIT_WINDOW_SECONDS = '60';
    headersMock.mockResolvedValue({
      get: (name: string): string | null => (name === 'x-forwarded-for' ? '1.2.3.4' : null),
    });

    const result = await resolveCoverageClientLimit();

    expect(result).not.toBeNull();
    expect(result?.dailyCap).toBe(5);
    expect(result?.keyHash).not.toBe('1.2.3.4');
    expect(result?.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(headersMock).toHaveBeenCalledTimes(1);
  });
});

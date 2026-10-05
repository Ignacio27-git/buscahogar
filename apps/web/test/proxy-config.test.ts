// ROADMAP 1.15 (security-hardening, spec #261 "The Proxy Limiter... Excludes
// Static Assets" / "Client Network Identity... disables both limiters when
// unset", diseño decisión 074/075) — `unstable_doesMiddlewareMatch` es la
// utilidad EXPERIMENTAL real que expone el paquete `next` instalado
// (16.3.4): la documentación embebida (`next/dist/docs/.../proxy.md`)
// nombra `unstable_doesProxyMatch`, pero `next/dist/experimental/testing/
// server/middleware-testing-utils.d.ts` solo exporta
// `unstable_doesMiddlewareMatch` en esta versión — confirmado leyendo el
// paquete instalado, no la documentación (ver apply-progress, Issues
// Found).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

import nextConfig from '../next.config.js';
import { config, proxy } from '../src/proxy.js';
import { hmacClientKey } from '../src/server/client-identity.js';

// Espía sobre la implementación real: permite comprobar que el proxy
// indexa su limitador por la clave HMAC y nunca por la IP en claro
// (diseño #262, flujo de datos del proxy; decisión 076).
vi.mock('../src/server/client-identity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/client-identity.js')>();
  return { hmacClientKey: vi.fn(actual.hmacClientKey) };
});

describe('proxy.ts — matcher excluye estáticos/imagen/favicon (spec #261)', () => {
  it.each([
    ['/_next/static/chunk.js', false],
    ['/_next/image?url=%2Ffoo.png&w=64&q=75', false],
    ['/favicon.ico', false],
    ['/', true],
    ['/some-page', true],
    ['/theme', true],
  ] as const)('%s -> matcher coincide = %s', (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(expected);
  });
});

describe('proxy.ts — passthrough cuando CLIENT_IP_HEADER no está definida (D1a)', () => {
  const originalHeader = process.env.CLIENT_IP_HEADER;

  beforeEach(() => {
    delete process.env.CLIENT_IP_HEADER;
  });

  afterEach(() => {
    if (originalHeader !== undefined) {
      process.env.CLIENT_IP_HEADER = originalHeader;
    }
  });

  it('deja pasar la petición sin 429 ni Retry-After', () => {
    const request = new NextRequest('https://example.com/');
    const response = proxy(request);
    expect(response.status).not.toBe(429);
    expect(response.headers.get('Retry-After')).toBeNull();
  });
});

describe('proxy.ts — limitador activo (spec #261, decisiones 075/076)', () => {
  const hmacKey = 'k'.repeat(32);

  beforeEach(() => {
    vi.stubEnv('CLIENT_IP_HEADER', 'x-real-ip');
    vi.stubEnv('CLIENT_IP_HMAC_KEY', hmacKey);
    vi.stubEnv('COVERAGE_PER_CLIENT_DAILY_CAP', '5');
    vi.stubEnv('PROXY_RATE_LIMIT_MAX', '2');
    vi.stubEnv('PROXY_RATE_LIMIT_WINDOW_SECONDS', '60');
    vi.mocked(hmacClientKey).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function requestFrom(headerValue: string | null): NextRequest {
    const headers = new Headers();
    if (headerValue !== null) {
      headers.set('x-real-ip', headerValue);
    }
    return new NextRequest('https://example.com/', { headers });
  }

  it('responde 429 con Retry-After al superar el máximo de la ventana', () => {
    expect(proxy(requestFrom('203.0.113.10')).status).not.toBe(429);
    expect(proxy(requestFrom('203.0.113.10')).status).not.toBe(429);
    const denied = proxy(requestFrom('203.0.113.10'));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('indexa el limitador por la clave HMAC de la IP, nunca por la IP en claro', () => {
    proxy(requestFrom('198.51.100.7'));
    expect(hmacClientKey).toHaveBeenCalledWith('198.51.100.7', hmacKey);
  });

  it('cabecera ausente, con lista o no-IP comparten el cubo unknown y nunca quedan exentas', () => {
    expect(proxy(requestFrom(null)).status).not.toBe(429);
    expect(proxy(requestFrom('garbage')).status).not.toBe(429);
    expect(proxy(requestFrom('203.0.113.1, 203.0.113.2')).status).toBe(429);
  });
});

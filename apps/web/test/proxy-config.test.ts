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

// ROADMAP 3.4 (decisión 255): el proxy usa el almacén COMPARTIDO de PostgreSQL. Aquí se sustituye por un
// doble en memoria que aplica la política del núcleo (la equivalencia SQL vs núcleo se prueba en
// `packages/db/test/proxy-rate-limit.test.ts`); `fakeStoreProbe` deja inspeccionar qué claves llegan.
const fakeStoreProbe = vi.hoisted(() => ({
  keys: [] as string[],
  buckets: new Map<string, { count: number; windowStart: number }>(),
  reset(): void {
    this.keys.length = 0;
    this.buckets.clear();
  },
}));

vi.mock('../src/server/proxy-limiter-db.js', async () => {
  const { evaluateFixedWindow } = await import('@buscahogar/core');
  return {
    proxyLimiterStore: {
      hit: (key: string, nowMs: number, params: { max: number; windowMs: number }): Promise<unknown> => {
        fakeStoreProbe.keys.push(key);
        const result = evaluateFixedWindow(fakeStoreProbe.buckets.get(key), nowMs, params);
        fakeStoreProbe.buckets.set(key, result.state);
        return Promise.resolve(result.state);
      },
    },
  };
});

describe('proxy.ts — matcher excluye estáticos/imagen/favicon (spec #261)', () => {
  it.each([
    ['/_next/static/chunk.js', false],
    ['/_next/image?url=%2Ffoo.png&w=64&q=75', false],
    ['/favicon.ico', false],
    // ROADMAP 3.4 (R1.8): la comprobación de salud no consume cuota ni escribe en el limitador.
    ['/api/health', false],
    ['/api/health?probe=1', false],
    ['/api/healthcheck', true],
    ['/api/health/x', true],
    ['/', true],
    ['/some-page', true],
    ['/theme', true],
    // D.5 (spec app-shell R8): los iconos no consumen cuota del limitador.
    ['/icon.svg', false],
    ['/icon', false],
    ['/apple-icon.png', false],
    ['/apple-icon', false],
    ['/icon.svg?abc123', false],
    ['/icon?abc123', false],
    ['/apple-icon.png?abc123', false],
    ['/apple-icon?abc123', false],
    ['/properties/1', true],
    // Controles negativos: prueban que la exclusión está anclada con `$`.
    ['/iconography', true],
    ['/icons/x', true],
    ['/apple-icon-x', true],
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

  it('deja pasar la petición sin 429 ni Retry-After', async () => {
    const request = new NextRequest('https://example.com/');
    const response = await proxy(request);
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

  it('responde 429 con Retry-After al superar el máximo de la ventana', async () => {
    expect((await proxy(requestFrom('203.0.113.10'))).status).not.toBe(429);
    expect((await proxy(requestFrom('203.0.113.10'))).status).not.toBe(429);
    const denied = await proxy(requestFrom('203.0.113.10'));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  // D.14 (decisión 189): el 429 es una página HTML en español, no texto plano.
  it('el 429 es HTML en español, con Retry-After tal cual, no-store y sin RateLimit-*', async () => {
    await proxy(requestFrom('203.0.113.20'));
    await proxy(requestFrom('203.0.113.20'));
    const denied = await proxy(requestFrom('203.0.113.20'));

    expect(denied.status).toBe(429);
    expect(denied.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(denied.headers.get('Retry-After')).toMatch(/^\d+(\.\d+)?$/);
    expect(denied.headers.get('Cache-Control')).toBe('no-store');
    expect([...denied.headers.keys()].filter((name) => name.startsWith('ratelimit'))).toEqual([]);
    const body = await denied.text();
    expect(body).toContain('<h1>Demasiadas peticiones seguidas</h1>');
    expect(body).not.toContain('Too Many Requests');
  });

  it('por debajo del límite la respuesta no es la página 429', async () => {
    const allowed = await proxy(requestFrom('203.0.113.21'));

    expect(allowed.status).not.toBe(429);
    expect(allowed.headers.get('Content-Type')).not.toBe('text/html; charset=utf-8');
  });

  it('indexa el limitador por la clave HMAC de la IP, nunca por la IP en claro', async () => {
    fakeStoreProbe.reset();

    await proxy(requestFrom('198.51.100.7'));

    expect(hmacClientKey).toHaveBeenCalledWith('198.51.100.7', hmacKey);
    expect(fakeStoreProbe.keys).toEqual([hmacClientKey('198.51.100.7', hmacKey)]);
    expect(fakeStoreProbe.keys.join(' ')).not.toContain('198.51.100.7');
  });

  it('cabecera ausente, con lista o no-IP comparten el cubo unknown y nunca quedan exentas', async () => {
    fakeStoreProbe.reset();

    expect((await proxy(requestFrom(null))).status).not.toBe(429);
    expect((await proxy(requestFrom('garbage'))).status).not.toBe(429);
    expect((await proxy(requestFrom('203.0.113.1, 203.0.113.2'))).status).toBe(429);
    // Las tres cayeron en UNA clave: la del cubo `unknown`.
    expect(new Set(fakeStoreProbe.keys)).toEqual(new Set([hmacClientKey('unknown', hmacKey)]));
    expect(fakeStoreProbe.keys).toHaveLength(3);
  });
});

// ROADMAP 3.4 (R3.1, R3.2, D7): en Vercel `CLIENT_IP_HEADER=x-forwarded-for` y la plataforma reescribe
// la cabecera con UNA sola IP de cliente. Una lista con comas (otra plataforma, cabecera sin sobrescribir)
// NO se interpreta: cae en el cubo `unknown`, nunca se elige una entrada al azar ni se confía en el
// primer elemento, que un cliente puede falsear.
describe('proxy.ts — CLIENT_IP_HEADER=x-forwarded-for (Vercel, decisión 255)', () => {
  const hmacKey = 'x'.repeat(32);

  beforeEach(() => {
    vi.stubEnv('CLIENT_IP_HEADER', 'x-forwarded-for');
    vi.stubEnv('CLIENT_IP_HMAC_KEY', hmacKey);
    vi.stubEnv('COVERAGE_PER_CLIENT_DAILY_CAP', '5');
    vi.stubEnv('PROXY_RATE_LIMIT_MAX', '1000');
    vi.stubEnv('PROXY_RATE_LIMIT_WINDOW_SECONDS', '60');
    fakeStoreProbe.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function keyFor(headerValue: string | null): Promise<string | undefined> {
    fakeStoreProbe.reset();
    const headers = new Headers();
    if (headerValue !== null) {
      headers.set('x-forwarded-for', headerValue);
    }
    const response = await proxy(new NextRequest('https://example.com/', { headers }));
    expect(response.status).not.toBe(500);
    return fakeStoreProbe.keys[0];
  }

  it('una IPv4 válida cuenta en el cubo de esa IP', async () => {
    expect(await keyFor('203.0.113.5')).toBe(hmacClientKey('203.0.113.5', hmacKey));
  });

  it('una IPv6 válida cuenta en el cubo de esa IP', async () => {
    expect(await keyFor('2001:db8::1')).toBe(hmacClientKey('2001:db8::1', hmacKey));
  });

  it('cabecera ausente: cubo unknown', async () => {
    expect(await keyFor(null)).toBe(hmacClientKey('unknown', hmacKey));
  });

  it('basura: cubo unknown, sin lanzar', async () => {
    expect(await keyFor('garbage')).toBe(hmacClientKey('unknown', hmacKey));
  });

  it('lista con comas: cubo unknown (no se elige ninguna entrada) y distinto del de la primera IP', async () => {
    const key = await keyFor('203.0.113.5, 198.51.100.1');

    expect(key).toBe(hmacClientKey('unknown', hmacKey));
    expect(key).not.toBe(hmacClientKey('203.0.113.5', hmacKey));
  });

  it('cabecera vacía: cubo unknown', async () => {
    expect(await keyFor('')).toBe(hmacClientKey('unknown', hmacKey));
  });
});

// ROADMAP 3.4 (R1.8): lo que el matcher excluye no llega al proxy, así que no escribe en el limitador.
describe('proxy.ts — /api/health no escribe en el limitador (R1.8)', () => {
  beforeEach(() => {
    vi.stubEnv('CLIENT_IP_HEADER', 'x-forwarded-for');
    vi.stubEnv('CLIENT_IP_HMAC_KEY', 'h'.repeat(32));
    vi.stubEnv('COVERAGE_PER_CLIENT_DAILY_CAP', '5');
    vi.stubEnv('PROXY_RATE_LIMIT_MAX', '5');
    vi.stubEnv('PROXY_RATE_LIMIT_WINDOW_SECONDS', '60');
    fakeStoreProbe.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Reproduce la decisión de Next: el proxy solo se invoca si el matcher coincide con la ruta.
  async function simulate(url: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      if (unstable_doesMiddlewareMatch({ config, nextConfig, url })) {
        await proxy(new NextRequest(`https://example.com${url}`, { headers: { 'x-forwarded-for': '203.0.113.9' } }));
      }
    }
  }

  it('1000 llamadas a /api/health no crean ninguna fila (ninguna llamada al almacén)', async () => {
    await simulate('/api/health', 1000);

    expect(fakeStoreProbe.keys).toHaveLength(0);
  });

  it('control: la misma simulación sobre una ruta normal SÍ llega al almacén', async () => {
    await simulate('/', 3);

    expect(fakeStoreProbe.keys).toHaveLength(3);
  });
});

// D.14 (decisión 189): el 429 de `proxy.ts` hereda las cabeceras de seguridad de `next.config`
// (fuente `/(.*)`); la CSP debe admitir el `<style>` en línea de la página.
describe('next.config — cabeceras de seguridad en la ruta que recibe el 429', () => {
  it('la fuente /(.*) lleva la CSP y esta admite estilos en línea', async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const catchAll = entries.find((entry) => entry.source === '/(.*)');
    const csp = catchAll?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(catchAll).toBeDefined();
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(catchAll?.headers.some((header) => header.key === 'Strict-Transport-Security')).toBe(true);
  });
});

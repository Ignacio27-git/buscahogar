// ROADMAP 1.15 (security-hardening, spec #261 "http-security-headers",
// diseño decisión 080) — CSP estática ("Without Nonces", guía oficial de
// Next.js: sin nonces no hace falta forzar renderizado dinámico) + set
// OWASP completo, vía `headers()` en `next.config.ts`. `isDev` se calcula
// DENTRO de `headers()` (invocada de nuevo en cada llamada, nunca cacheada
// al cargar el módulo) para que `vi.stubEnv` pueda mutar NODE_ENV y
// observar el cambio sin reimportar el módulo.
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config.js';

interface HeaderEntry {
  readonly key: string;
  readonly value: string;
}

interface HeaderRule {
  readonly source: string;
  readonly headers: readonly HeaderEntry[];
}

async function getHeadersFor(path: string): Promise<Record<string, string>> {
  if (typeof nextConfig.headers !== 'function') {
    throw new Error('next.config.ts debe exportar headers() (diseño decisión 080).');
  }
  const rules = (await nextConfig.headers()) as readonly HeaderRule[];
  const matched = rules.find((rule) => rule.source === path);
  if (!matched) {
    throw new Error(`Ninguna regla de headers() coincide con "${path}".`);
  }
  const result: Record<string, string> = {};
  for (const header of matched.headers) {
    result[header.key] = header.value;
  }
  return result;
}

describe('next.config.ts — poweredByHeader (spec #261 "No X-Powered-By")', () => {
  it('poweredByHeader está desactivado', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe('next.config.ts headers() — CSP estática + set OWASP (spec #261, decisión 080)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('produce CSP y el set completo de cabeceras OWASP para cualquier ruta', async () => {
    const headers = await getHeadersFor('/(.*)');
    expect(headers['Content-Security-Policy']).toBeDefined();
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBeDefined();
    expect(headers['Permissions-Policy']).toBeDefined();
    // La app nunca se enmarca a sí misma: la política más estricta (guía
    // oficial de Next "Without Nonces" y OWASP), no la de mismo origen.
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Cross-Origin-Opener-Policy']).toBeDefined();
    expect(headers['Cross-Origin-Resource-Policy']).toBeDefined();
  });

  it("'unsafe-eval' está presente en desarrollo y AUSENTE en producción", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const prodHeaders = await getHeadersFor('/(.*)');
    expect(prodHeaders['Content-Security-Policy']).not.toContain('unsafe-eval');

    vi.stubEnv('NODE_ENV', 'development');
    const devHeaders = await getHeadersFor('/(.*)');
    expect(devHeaders['Content-Security-Policy']).toContain('unsafe-eval');
  });

  it('Cross-Origin-Embedder-Policy NUNCA está presente (decisión 080)', async () => {
    const headers = await getHeadersFor('/(.*)');
    expect(headers['Cross-Origin-Embedder-Policy']).toBeUndefined();
  });
});

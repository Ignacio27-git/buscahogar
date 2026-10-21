// ROADMAP 1.15 (security-hardening, spec #261 "server-only Guards Every
// Server-Side DB Module", diseño decisión 081) — allowlist EXACTA: los
// cuatro módulos que manejan handles de DB o secretos. `env.ts`,
// `client-identity.ts`, `proxy-rate-limit.ts` y `proxy-limiter-db.ts` (ROADMAP 3.4) quedan FUERA a propósito
// (alcanzables desde `proxy.ts`, cuyo runtime no admite el guard
// `server-only`). Mismo patrón que `test/no-client-directive.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SERVER_DIR = fileURLToPath(new URL('../src/server/', import.meta.url));

// D.14 (decisión 187): `property-header.ts` consulta la base de datos con el handle de `db.ts`.
const GUARDED_MODULES = ['db.ts', 'coverage-db.ts', 'coverage.ts', 'coverage-client.ts', 'property-header.ts'] as const;

function importsServerOnly(source: string): boolean {
  return /^\s*import\s+['"]server-only['"]/m.test(source);
}

describe('Frontera server-only (spec #261, diseño decisión 081)', () => {
  it.each(GUARDED_MODULES)('%s importa "server-only"', (file) => {
    const source = readFileSync(`${SERVER_DIR}${file}`, 'utf8');
    expect(importsServerOnly(source)).toBe(true);
  });

  it('env.ts, client-identity.ts, proxy-rate-limit.ts, proxy-limiter-db.ts y rate-limit-page.ts NO importan "server-only" (alcanzables desde proxy.ts)', () => {
    for (const file of ['env.ts', 'client-identity.ts', 'proxy-rate-limit.ts', 'proxy-limiter-db.ts', 'rate-limit-page.ts']) {
      const source = readFileSync(`${SERVER_DIR}${file}`, 'utf8');
      expect(importsServerOnly(source)).toBe(false);
    }
  });
});

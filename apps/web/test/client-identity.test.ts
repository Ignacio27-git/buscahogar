// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage Limit
// Is Enforced In PostgreSQL, Keyed By An HMAC-SHA256 Digest, Never The Raw
// Value", diseño decisión 076) — validador notes (obs #263): pruebas HMAC
// deterministas, dependientes de la clave, y que nunca produzcan la
// identidad cruda.
import { describe, expect, it } from 'vitest';

import { hmacClientKey } from '../src/server/client-identity.js';

describe('hmacClientKey (spec #261, decisión 076)', () => {
  it('es determinista: la misma identidad y clave producen siempre el mismo hex', () => {
    expect(hmacClientKey('1.2.3.4', 'a'.repeat(32))).toBe(hmacClientKey('1.2.3.4', 'a'.repeat(32)));
  });

  it('depende de la clave: la misma identidad con claves distintas produce hex distinto', () => {
    expect(hmacClientKey('1.2.3.4', 'a'.repeat(32))).not.toBe(hmacClientKey('1.2.3.4', 'b'.repeat(32)));
  });

  it('depende de la identidad: identidades distintas con la misma clave producen hex distinto', () => {
    expect(hmacClientKey('1.2.3.4', 'a'.repeat(32))).not.toBe(hmacClientKey('5.6.7.8', 'a'.repeat(32)));
  });

  it('nunca es igual a la identidad cruda, ni la contiene (spec #261 "Raw client identity is never persisted")', () => {
    const identity = '1.2.3.4';
    const digest = hmacClientKey(identity, 'a'.repeat(32));
    expect(digest).not.toBe(identity);
    expect(digest).not.toContain(identity);
  });

  it('produce un hex de 64 caracteres (SHA-256 hex)', () => {
    expect(hmacClientKey('1.2.3.4', 'a'.repeat(32))).toMatch(/^[0-9a-f]{64}$/);
  });
});

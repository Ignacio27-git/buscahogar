// ROADMAP 3.4 (decisión 257, D10; R5.3) — verificador SCRAM-SHA-256 calculado en Node. La contraseña en
// claro nunca viaja en SQL ni en registros: PostgreSQL acepta el verificador ya calculado
// (`SCRAM-SHA-256$<iter>:<sal>$<StoredKey>:<ServerKey>`) como valor de `PASSWORD`. La corrección
// contra un servidor real (el rol inicia sesión con la contraseña en claro) se prueba en
// `provision-roles.test.ts`; aquí, el formato, el determinismo con sal inyectada y los rechazos.
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scramSha256Verifier } from '../../src/scram.js';

const SALT = Buffer.from('0123456789abcdef', 'utf8');

// Derivación independiente de RFC 5802 / 7677 (SaltedPassword, ClientKey, StoredKey, ServerKey).
function expectedVerifier(password: string, salt: Buffer, iterations: number): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${String(iterations)}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

describe('scramSha256Verifier — formato y determinismo (decisión 257, D10)', () => {
  it('produce el formato de PostgreSQL con 4096 iteraciones', () => {
    const verifier = scramSha256Verifier('s3cret-pass', { salt: SALT });

    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
    expect(verifier).toBe(expectedVerifier('s3cret-pass', SALT, 4096));
  });

  it('es determinista con la misma sal y cambia con otra sal u otra contraseña', () => {
    const base = scramSha256Verifier('s3cret-pass', { salt: SALT });

    expect(scramSha256Verifier('s3cret-pass', { salt: SALT })).toBe(base);
    expect(scramSha256Verifier('s3cret-pass', { salt: Buffer.from('fedcba9876543210', 'utf8') })).not.toBe(base);
    expect(scramSha256Verifier('otra-pass', { salt: SALT })).not.toBe(base);
    expect(scramSha256Verifier('otra-pass', { salt: SALT })).toBe(expectedVerifier('otra-pass', SALT, 4096));
  });

  it('sin sal inyectada genera una sal aleatoria distinta en cada llamada', () => {
    const first = scramSha256Verifier('s3cret-pass');
    const second = scramSha256Verifier('s3cret-pass');

    expect(first).not.toBe(second);
    expect(first.startsWith('SCRAM-SHA-256$4096:')).toBe(true);
  });

  it('nunca contiene la contraseña en claro', () => {
    const password = 'Plain-Text-Marker-9981';

    expect(scramSha256Verifier(password, { salt: SALT })).not.toContain(password);
  });

  it('rechaza una contraseña vacía o con caracteres no imprimibles/no ASCII', () => {
    expect(() => scramSha256Verifier('')).toThrow(/contraseña/);
    expect(() => scramSha256Verifier('con\nsalto')).toThrow(/contraseña/);
    expect(() => scramSha256Verifier('ñandú-pass')).toThrow(/contraseña/);
    expect(() => scramSha256Verifier('con espacio ok')).not.toThrow();
  });
});

// Paso 1.6 — scrubCredentials: vía de fuga de credenciales en logs (diseño
// D5). Reimplementación deliberada de scripts/probe-idealista.ts:70-79
// (solo lectura, decisión confirmada 2 prohíbe tocar la sonda; duplicación
// consciente de ~10 líneas, DECISIONS 033/034) — extendida para cubrir
// también el token de acceso, que la sonda no maneja porque nunca lo loguea.
import { describe, expect, it } from 'vitest';

import { scrubCredentials } from '../src/sources/idealista/scrub-credentials.js';

describe('scrubCredentials — fuga de credenciales en logs (D5)', () => {
  const credentials = { apiKey: 'fake-key-123', apiSecret: 'fake-secret-456', accessToken: 'fake-token-abc' };

  it('elimina la clave, el secreto y el token de acceso de un excerpt de cuerpo', () => {
    const body = 'Authorization: Bearer fake-token-abc\nkey=fake-key-123&secret=fake-secret-456';
    const scrubbed = scrubCredentials(body, credentials);
    expect(scrubbed).not.toContain(credentials.apiKey);
    expect(scrubbed).not.toContain(credentials.apiSecret);
    expect(scrubbed).not.toContain(credentials.accessToken);
    expect(scrubbed).toContain('[REDACTED]');
  });

  it('deja intacto un texto que no contiene ningún secreto', () => {
    expect(scrubCredentials('sin secretos aquí', credentials)).toBe('sin secretos aquí');
  });

  it('trata una credencial de cadena vacía como ausente, sin lanzar', () => {
    expect(() => scrubCredentials('texto cualquiera', { apiKey: '', apiSecret: '' })).not.toThrow();
    expect(scrubCredentials('texto cualquiera', { apiKey: '', apiSecret: '' })).toBe('texto cualquiera');
  });

  it('accessToken es opcional: funciona igual sin él', () => {
    const scrubbed = scrubCredentials('key=fake-key-123', { apiKey: 'fake-key-123', apiSecret: 'fake-secret-456' });
    expect(scrubbed).not.toContain('fake-key-123');
  });

  it('elimina TODAS las apariciones del secreto, no solo la primera', () => {
    const body = 'fake-key-123 ... fake-key-123 otra vez';
    const scrubbed = scrubCredentials(body, credentials);
    expect(scrubbed).not.toContain(credentials.apiKey);
    expect(scrubbed.match(/\[REDACTED\]/g)).toHaveLength(2);
  });
});

// Sonda de la API de Idealista (paso 1.5) — forma de la petición, extremo a
// extremo, con `fetch` sustituido por un espía y un `ProbeIo` en memoria.
// Nunca toca la red real ni el disco real (REQ-NONET); las credenciales son
// siempre valores de prueba evidentemente falsos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProbeCredentials, ProbeIo } from '../scripts/probe-idealista.js';
import { readCredentials, runProbe } from '../scripts/probe-idealista.js';
import { buildSearchFields } from '../scripts/probe/options.js';
import type { ProbeOptions } from '../scripts/probe/options.js';

const FAKE_CREDENTIALS: ProbeCredentials = { apiKey: 'fake-key-123', apiSecret: 'fake-secret-456' };

function createMemoryIo(existing: ReadonlySet<string> = new Set()): ProbeIo & {
  readonly logged: string[];
  readonly written: Map<string, string>;
} {
  const logged: string[] = [];
  const written = new Map<string, string>();
  return {
    logged,
    written,
    log(line: string): void {
      logged.push(line);
    },
    async writeFile(path: string, contents: string): Promise<void> {
      written.set(path, contents);
      await Promise.resolve();
    },
    async fileExists(path: string): Promise<boolean> {
      await Promise.resolve();
      return existing.has(path) || written.has(path);
    },
    async readFile(path: string): Promise<string> {
      await Promise.resolve();
      const contents = written.get(path);
      if (contents === undefined) throw new Error(`fichero no encontrado en el io de memoria: ${path}`);
      return contents;
    },
  };
}

function dryRunOptions(): ProbeOptions {
  return { mode: 'dry-run', profile: 'homes', analysePaths: [], overwrite: false };
}

function executeOptions(overwrite = false): ProbeOptions {
  return { mode: 'execute', profile: 'homes', analysePaths: [], overwrite };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runProbe — modo dry-run', () => {
  it('imprime la petición planeada (URL, método, campos) y nunca abre una conexión de red', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const exitCode = await runProbe(dryRunOptions(), FAKE_CREDENTIALS, io);

    expect(exitCode).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const output = io.logged.join('\n');
    expect(output).toContain('POST');
    expect(output).toContain('https://api.idealista.com/3.5/es/search');
    expect(output).not.toContain(FAKE_CREDENTIALS.apiKey);
    expect(output).not.toContain(FAKE_CREDENTIALS.apiSecret);
    expect(output).not.toContain('Authorization');
    for (const field of buildSearchFields('homes')) {
      expect(output).toContain(field.name);
      expect(output).toContain(field.value);
    }
  });
});

describe('runProbe — modo execute', () => {
  it('la petición de token es POST con Authorization: Basic y cuerpo URLSearchParams', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc', token_type: 'bearer' }))
      .mockResolvedValueOnce(jsonResponse(200, { elementList: [], total: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://api.idealista.com/oauth/token');
    expect(tokenInit.method).toBe('POST');
    const headers = tokenInit.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(tokenInit.body).toBeInstanceOf(URLSearchParams);
    const body = tokenInit.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('read');
  });

  it('una respuesta de token sin access_token falla antes de la búsqueda: ledger token:1, search:0, salida no-cero', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse(200, { token_type: 'bearer' }));
    vi.stubGlobal('fetch', fetchSpy);

    const exitCode = await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    expect(exitCode).not.toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const output = io.logged.join('\n');
    expect(output).toContain('token');
    expect(output).toMatch(/token\s+POST[^\n]*1/);
    expect(output).toMatch(/búsqueda\s+POST[^\n]*0/);
  });

  it('la petición de búsqueda lleva Authorization: Bearer <token> y un FormData con exactamente los seis campos, sin content-type propio', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc' }))
      .mockResolvedValueOnce(jsonResponse(200, { elementList: [], total: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    const [searchUrl, searchInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(searchUrl).toBe('https://api.idealista.com/3.5/es/search');
    const headers = searchInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fake-token-abc');
    expect(Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')).toBe(false);
    expect(searchInit.body).toBeInstanceOf(FormData);
    const formData = searchInit.body as FormData;
    const fields = buildSearchFields('homes');
    expect([...formData.keys()]).toHaveLength(fields.length);
    for (const field of fields) {
      expect(formData.get(field.name)).toBe(field.value);
    }
  });

  it('en éxito el ledger muestra token:1 y search:1, y se escriben la fixture, el sidecar y la copia cruda bajo la ruta ignorada por git', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { elementList: [], total: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    const exitCode = await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    expect(exitCode).toBe(0);
    const writtenPaths = [...io.written.keys()];
    expect(writtenPaths.some((path) => path.includes('raw/') && path.includes('.raw.json'))).toBe(true);
    expect(writtenPaths.some((path) => path.endsWith('.meta.json'))).toBe(true);
    expect(
      writtenPaths.some((path) => path.endsWith('.json') && !path.endsWith('.meta.json') && !path.includes('raw/'))
    ).toBe(true);
    const output = io.logged.join('\n');
    expect(output).toMatch(/token\s+POST[^\n]*1/);
    expect(output).toMatch(/búsqueda\s+POST[^\n]*1/);
  });

  it('si la fixture del perfil ya existe y no se pasa --overwrite, sale con error antes de cualquier petición de red', async () => {
    const existingPath = 'test/fixtures/idealista/search-homes-2026-09-10.json';
    const io = createMemoryIo(new Set([existingPath]));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const exitCode = await runProbe(executeOptions(false), FAKE_CREDENTIALS, io);

    expect(exitCode).not.toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('una respuesta de búsqueda no-2xx cuenta igual la petición, no reintenta y sale con error', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc' }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchSpy);

    const exitCode = await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    expect(exitCode).not.toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const output = io.logged.join('\n');
    expect(output).toMatch(/búsqueda\s+POST[^\n]*1/);
  });

  it('ninguna línea registrada ni fichero escrito contiene la clave, el secreto o el token falsos', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc' }))
      .mockResolvedValueOnce(jsonResponse(200, { elementList: [], total: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    const loggedText = io.logged.join('\n');
    const writtenText = [...io.written.values()].join('\n');
    for (const secret of [FAKE_CREDENTIALS.apiKey, FAKE_CREDENTIALS.apiSecret, 'fake-token-abc']) {
      expect(loggedText).not.toContain(secret);
      expect(writtenText).not.toContain(secret);
    }
  });

  it('la copia cruda se escribe antes de cualquier transformación, y el sidecar nunca incluye access_token ni credenciales', async () => {
    const io = createMemoryIo();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fake-token-abc', expires_in: 3600, token_type: 'bearer', scope: 'read' }))
      .mockResolvedValueOnce(jsonResponse(200, { elementList: [], total: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    await runProbe(executeOptions(), FAKE_CREDENTIALS, io);

    const metaPath = [...io.written.keys()].find((path) => path.endsWith('.meta.json'));
    expect(metaPath).toBeDefined();
    const metaContents = io.written.get(metaPath ?? '');
    expect(metaContents).toBeDefined();
    const meta = JSON.parse(metaContents ?? '{}') as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain('access_token');
    expect(JSON.stringify(meta)).not.toContain('fake-token-abc');
    expect(JSON.stringify(meta)).not.toContain(FAKE_CREDENTIALS.apiKey);
    expect(JSON.stringify(meta)).not.toContain(FAKE_CREDENTIALS.apiSecret);
    expect(meta.httpStatus).toBe(200);
    expect(meta.endpoint).toBe('https://api.idealista.com/3.5/es/search');
  });
});

describe('readCredentials', () => {
  it('falla antes de cualquier petición de red si falta IDEALISTA_API_KEY o IDEALISTA_API_SECRET', () => {
    expect(() => readCredentials({ IDEALISTA_API_SECRET: 'x' })).toThrow();
    expect(() => readCredentials({ IDEALISTA_API_KEY: 'x' })).toThrow();
  });

  it('trata una credencial de cadena vacía igual que una ausente', () => {
    expect(() =>
      readCredentials({ IDEALISTA_API_KEY: '', IDEALISTA_API_SECRET: 'x' })
    ).toThrow();
    expect(() =>
      readCredentials({ IDEALISTA_API_KEY: 'x', IDEALISTA_API_SECRET: '' })
    ).toThrow();
  });

  it('acepta ambas variables presentes y no vacías', () => {
    const credentials = readCredentials({ IDEALISTA_API_KEY: 'k', IDEALISTA_API_SECRET: 's' });
    expect(credentials).toEqual({ apiKey: 'k', apiSecret: 's' });
  });
});

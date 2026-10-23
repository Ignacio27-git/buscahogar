// ROADMAP 3.4 (decisión 263 parte C; D22; R10.4) — arranque de apps/web: `register()` de Next 16 (se llama UNA
// vez al iniciar la instancia del servidor, antes de atender peticiones) registra los avisos de producción como
// líneas JSON en `warn`. Nunca falla el arranque por un aviso, y solo emite nombres y motivos fijos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { register } from '../src/instrumentation.js';
import { classifyEnv } from '../src/server/env-classifier.js';
import { resetStartupWarningsForTests } from '../src/server/startup-warnings.js';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://web_readonly:secreto-ro@pooler.example.test/buscahogar',
  WEB_COVERAGE_DATABASE_URL: 'postgresql://web_coverage:secreto-cov@pooler.example.test/buscahogar',
  NEW_ZONES_DAILY_CAP: '20',
} as const;

const MANAGED_NAMES = [
  ...Object.keys(REQUIRED_ENV),
  'LEGAL_OWNER_NAME',
  'LEGAL_OWNER_TAX_ID',
  'LEGAL_OWNER_ADDRESS',
  'LEGAL_OWNER_EMAIL',
  'TILE_URL_TEMPLATE',
  'TILE_ATTRIBUTION',
  'CLIENT_IP_HEADER',
  'SITE_INDEXING',
  'SITE_URL',
] as const;

interface LoggedLine {
  readonly ts: string;
  readonly level: string;
  readonly component: string;
  readonly msg: string;
  readonly name: string;
  readonly reason: string;
}

function setEnv(values: Readonly<Record<string, string>>, nodeEnv: string, runtime: string | undefined): void {
  for (const name of MANAGED_NAMES) {
    vi.stubEnv(name, '');
  }
  for (const [name, value] of Object.entries(values)) {
    vi.stubEnv(name, value);
  }
  vi.stubEnv('NODE_ENV', nodeEnv);
  if (runtime === undefined) {
    vi.stubEnv('NEXT_RUNTIME', '');
  } else {
    vi.stubEnv('NEXT_RUNTIME', runtime);
  }
}

describe('instrumentation register()', () => {
  let warn: MockInstance<typeof console.warn>;
  let error: MockInstance<typeof console.error>;

  beforeEach(() => {
    resetStartupWarningsForTests();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function warnings(): LoggedLine[] {
    return warn.mock.calls.map((call) => JSON.parse(String(call[0])) as LoggedLine);
  }

  it('producción en Node con el entorno mínimo: una línea JSON `warn` por aviso, con la paridad del clasificador', async () => {
    setEnv(REQUIRED_ENV, 'production', 'nodejs');

    await register();

    const expected = classifyEnv(process.env, 'production')
      .filter((issue) => issue.severity === 'production-warning')
      .map((issue) => issue.name);
    expect(expected).toContain('LEGAL_OWNER_NAME');
    expect(expected).toContain('TILE_URL_TEMPLATE');
    const lines = warnings();
    expect(lines.map((line) => line.name)).toEqual(expected);
    for (const line of lines) {
      expect(line).toMatchObject({ level: 'warn', component: 'web', msg: 'production-warning' });
      expect(Number.isNaN(Date.parse(line.ts))).toBe(false);
      expect(line.reason.length).toBeGreaterThan(10);
    }
    expect(error).not.toHaveBeenCalled();
  });

  it('avisa UNA sola vez por proceso aunque se vuelva a llamar', async () => {
    setEnv(REQUIRED_ENV, 'production', 'nodejs');

    await register();
    const first = warn.mock.calls.length;
    await register();

    expect(first).toBeGreaterThan(0);
    expect(warn.mock.calls.length).toBe(first);
  });

  it('nunca imprime valores de configuración', async () => {
    setEnv({ ...REQUIRED_ENV, LEGAL_OWNER_NAME: 'Ana Pérez López' }, 'production', 'nodejs');

    await register();

    const everything = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(everything).not.toContain('secreto-ro');
    expect(everything).not.toContain('secreto-cov');
    expect(everything).not.toContain('Ana Pérez');
  });

  it('identidad y teselas configuradas: ningún aviso', async () => {
    setEnv(
      {
        ...REQUIRED_ENV,
        LEGAL_OWNER_NAME: 'Ana Pérez López',
        LEGAL_OWNER_TAX_ID: '12345678Z',
        LEGAL_OWNER_ADDRESS: 'Calle Mayor 1, 28013 Madrid',
        LEGAL_OWNER_EMAIL: 'contacto@example.test',
        TILE_URL_TEMPLATE: 'https://tiles.example.test/{z}/{x}/{y}.png',
        TILE_ATTRIBUTION: '© Proveedor',
      },
      'production',
      'nodejs'
    );

    await register();

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('desarrollo: no avisa (los avisos son de producción)', async () => {
    setEnv(REQUIRED_ENV, 'development', 'nodejs');

    await register();

    expect(warn).not.toHaveBeenCalled();
  });

  it('runtime edge: no hace nada (el registro es de Node)', async () => {
    setEnv(REQUIRED_ENV, 'production', 'edge');

    await register();

    expect(warn).not.toHaveBeenCalled();
  });

  it('un error de configuración se registra como `error` JSON y NO impide el arranque', async () => {
    setEnv({ DATABASE_URL: REQUIRED_ENV.DATABASE_URL }, 'production', 'nodejs');

    await expect(register()).resolves.toBeUndefined();

    const errorNames = error.mock.calls.map((call) => (JSON.parse(String(call[0])) as LoggedLine).name);
    expect(errorNames).toEqual(['WEB_COVERAGE_DATABASE_URL', 'NEW_ZONES_DAILY_CAP']);
    const first = JSON.parse(String(error.mock.calls[0]?.[0])) as LoggedLine;
    expect(first).toMatchObject({ level: 'error', component: 'web', msg: 'env-error' });
  });
});

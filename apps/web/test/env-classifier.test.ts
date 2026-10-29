// ROADMAP 3.4 (decisión 263 parte C; D22; R10.4, R12.2) — clasificador de entorno de apps/web. Una sola lista
// de problemas (`error` y `production-warning`) que comparten el arranque (`instrumentation.ts`) y `env:check`:
// solo NOMBRES de variable y motivos fijos, jamás valores.
import { describe, expect, it } from 'vitest';

import {
  classifyEnv,
  envCheckExitCode,
  parseEnvTarget,
  renderEnvReport,
} from '../src/server/env-classifier.js';
import type { EnvIssue } from '../src/server/env-classifier.js';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://web_readonly:secreto-ro@pooler.example.test/buscahogar',
  WEB_COVERAGE_DATABASE_URL: 'postgresql://web_coverage:secreto-cov@pooler.example.test/buscahogar',
  NEW_ZONES_DAILY_CAP: '20',
  LEGAL_OWNER_NAME: 'Ana Pérez López',
  LEGAL_OWNER_TAX_ID: '12345678Z',
  LEGAL_OWNER_ADDRESS: 'Calle Mayor 1, 28013 Madrid',
  LEGAL_OWNER_EMAIL: 'contacto@example.test',
  TILE_URL_TEMPLATE: 'https://tiles.example.test/{z}/{x}/{y}.png?key=publicable',
  TILE_ATTRIBUTION: '© Proveedor de teselas',
} as const;

// Copia del entorno sin una variable (para probar que su ausencia se nombra).
function omit(source: Readonly<Record<string, string>>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== name));
}

function names(issues: readonly EnvIssue[], severity: EnvIssue['severity']): string[] {
  return issues.filter((issue) => issue.severity === severity).map((issue) => issue.name);
}

describe('classifyEnv (web) — errores', () => {
  it('entorno completo: ni errores ni avisos', () => {
    expect(classifyEnv(VALID_ENV, 'production')).toEqual([]);
    expect(classifyEnv(VALID_ENV, 'local')).toEqual([]);
  });

  it('entorno vacío: nombra las tres variables obligatorias, en orden estable', () => {
    expect(names(classifyEnv({}, 'local'), 'error')).toEqual([
      'DATABASE_URL',
      'WEB_COVERAGE_DATABASE_URL',
      'NEW_ZONES_DAILY_CAP',
    ]);
  });

  it('una variable en blanco cuenta como ausente; una mal formada se marca inválida (motivos distintos)', () => {
    const issues = classifyEnv({ ...VALID_ENV, DATABASE_URL: '   ', NEW_ZONES_DAILY_CAP: 'veinte' }, 'local');

    expect(names(issues, 'error')).toEqual(['DATABASE_URL', 'NEW_ZONES_DAILY_CAP']);
    const [missing, invalid] = issues;
    expect(missing?.reason).toMatch(/falta/i);
    expect(invalid?.reason).toMatch(/inválid/i);
    expect(missing?.reason).not.toBe(invalid?.reason);
  });

  it('CLIENT_IP_HEADER definida exige las otras cuatro; sin definir no exige ninguna', () => {
    expect(names(classifyEnv(VALID_ENV, 'local'), 'error')).toEqual([]);

    const issues = classifyEnv({ ...VALID_ENV, CLIENT_IP_HEADER: 'x-forwarded-for' }, 'local');
    expect(names(issues, 'error')).toEqual([
      'CLIENT_IP_HMAC_KEY',
      'COVERAGE_PER_CLIENT_DAILY_CAP',
      'PROXY_RATE_LIMIT_MAX',
      'PROXY_RATE_LIMIT_WINDOW_SECONDS',
    ]);
  });

  it('CLIENT_IP_HEADER completa: nombra solo la que falla (clave corta, tope no numérico)', () => {
    const issues = classifyEnv(
      {
        ...VALID_ENV,
        CLIENT_IP_HEADER: 'x-forwarded-for',
        CLIENT_IP_HMAC_KEY: 'corta',
        COVERAGE_PER_CLIENT_DAILY_CAP: '10',
        PROXY_RATE_LIMIT_MAX: 'x',
        PROXY_RATE_LIMIT_WINDOW_SECONDS: '60',
      },
      'local'
    );

    expect(names(issues, 'error')).toEqual(['CLIENT_IP_HMAC_KEY', 'PROXY_RATE_LIMIT_MAX']);
    expect(JSON.stringify(issues)).not.toContain('corta');
  });

  it('plantilla de teselas inválida: error que nombra TILE_URL_TEMPLATE y no repite la clave', () => {
    const issues = classifyEnv(
      { ...VALID_ENV, TILE_URL_TEMPLATE: 'http://tiles.example.test/{z}/{x}/{y}.png?key=SECRETA-999' },
      'local'
    );

    expect(names(issues, 'error')).toEqual(['TILE_URL_TEMPLATE']);
    expect(JSON.stringify(issues)).not.toContain('SECRETA-999');
  });

  it('atribución sin proveedor propio: nombra las dos variables implicadas', () => {
    const withoutTemplate = omit(VALID_ENV, 'TILE_URL_TEMPLATE');

    expect(names(classifyEnv(withoutTemplate, 'local'), 'error')).toEqual(['TILE_URL_TEMPLATE', 'TILE_ATTRIBUTION']);
  });

  it('SITE_INDEXING=true sin SITE_URL, y SITE_URL con ruta, son errores nombrados', () => {
    expect(names(classifyEnv({ ...VALID_ENV, SITE_INDEXING: 'true' }, 'local'), 'error')).toContain('SITE_URL');
    expect(
      names(classifyEnv({ ...VALID_ENV, SITE_URL: 'https://example.test/ruta?x=1' }, 'local'), 'error')
    ).toEqual(['SITE_URL']);
    expect(names(classifyEnv({ ...VALID_ENV, SITE_INDEXING: 'quizá' }, 'local'), 'error')).toEqual(['SITE_INDEXING']);
  });

  it('LEGAL_OWNER_EMAIL mal formado es un error (no un aviso) que no repite el valor', () => {
    const issues = classifyEnv({ ...VALID_ENV, LEGAL_OWNER_EMAIL: 'no-es-un-correo-privado' }, 'production');

    expect(names(issues, 'error')).toEqual(['LEGAL_OWNER_EMAIL']);
    expect(JSON.stringify(issues)).not.toContain('no-es-un-correo-privado');
  });

  it('una variable NEXT_PUBLIC_ con nombre de credencial es un error (solo el nombre)', () => {
    const leaked = 'NEXT_PUBLIC_' + 'DATABASE_URL';
    const issues = classifyEnv({ ...VALID_ENV, [leaked]: 'postgresql://valor-privado' }, 'local');

    expect(names(issues, 'error')).toEqual([leaked]);
    expect(JSON.stringify(issues)).not.toContain('valor-privado');
  });

  it('NEXT_PUBLIC_ inocuas no se señalan', () => {
    expect(classifyEnv({ ...VALID_ENV, NEXT_PUBLIC_SITE_NAME: 'Buscahogar' }, 'local')).toEqual([]);
  });

  it('ningún valor se copia a la lista, ni de variables válidas ni de inválidas', () => {
    const everything = JSON.stringify(
      classifyEnv({ ...VALID_ENV, NEW_ZONES_DAILY_CAP: 'abc', LEGAL_OWNER_EMAIL: 'x' }, 'production')
    );
    for (const secret of ['secreto-ro', 'secreto-cov', 'publicable', '12345678Z', 'Calle Mayor']) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe('classifyEnv (web) — avisos de producción', () => {
  const REQUIRED_ONLY = {
    DATABASE_URL: VALID_ENV.DATABASE_URL,
    WEB_COVERAGE_DATABASE_URL: VALID_ENV.WEB_COVERAGE_DATABASE_URL,
    NEW_ZONES_DAILY_CAP: '20',
  };

  it('destino local: nunca hay avisos de producción', () => {
    expect(names(classifyEnv(REQUIRED_ONLY, 'local'), 'production-warning')).toEqual([]);
  });

  it('destino producción sin identidad ni proveedor de teselas: LEGAL_OWNER_* y TILE_URL_TEMPLATE', () => {
    const issues = classifyEnv(REQUIRED_ONLY, 'production');

    expect(names(issues, 'error')).toEqual([]);
    expect(names(issues, 'production-warning')).toEqual([
      'LEGAL_OWNER_NAME',
      'LEGAL_OWNER_TAX_ID',
      'LEGAL_OWNER_ADDRESS',
      'LEGAL_OWNER_EMAIL',
      'TILE_URL_TEMPLATE',
    ]);
  });

  it('identidad parcial: avisa solo de lo que falta', () => {
    const issues = classifyEnv(
      { ...VALID_ENV, LEGAL_OWNER_TAX_ID: '', LEGAL_OWNER_ADDRESS: undefined },
      'production'
    );

    expect(names(issues, 'production-warning')).toEqual(['LEGAL_OWNER_TAX_ID', 'LEGAL_OWNER_ADDRESS']);
  });

  it('plantilla de OSM escrita explícitamente sigue siendo el proveedor por defecto', () => {
    const issues = classifyEnv(
      { ...VALID_ENV, TILE_URL_TEMPLATE: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', TILE_ATTRIBUTION: undefined },
      'production'
    );

    expect(names(issues, 'production-warning')).toEqual(['TILE_URL_TEMPLATE']);
  });

  it('los avisos llevan motivo en español y no contienen valores', () => {
    const issues = classifyEnv(REQUIRED_ONLY, 'production');

    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.reason.length).toBeGreaterThan(10);
      expect(issue.reason).not.toContain('postgresql://');
    }
  });
});

describe('env:check — código de salida e informe', () => {
  const warning: EnvIssue = { name: 'TILE_URL_TEMPLATE', severity: 'production-warning', reason: 'motivo fijo' };
  const error: EnvIssue = { name: 'DATABASE_URL', severity: 'error', reason: 'falta o está en blanco' };

  it('local: sale 1 solo con errores; los avisos no cuentan', () => {
    expect(envCheckExitCode([], 'local')).toBe(0);
    expect(envCheckExitCode([warning], 'local')).toBe(0);
    expect(envCheckExitCode([error], 'local')).toBe(1);
  });

  it('producción: sale 1 con errores y también con avisos', () => {
    expect(envCheckExitCode([], 'production')).toBe(0);
    expect(envCheckExitCode([warning], 'production')).toBe(1);
    expect(envCheckExitCode([error, warning], 'production')).toBe(1);
  });

  it('el informe lista nombre y motivo de cada problema, y un resumen cuando todo está bien', () => {
    const report = renderEnvReport([error, warning], 'production');
    expect(report).toContain('DATABASE_URL');
    expect(report).toContain('TILE_URL_TEMPLATE');
    expect(report).toContain('falta o está en blanco');
    expect(renderEnvReport([], 'local')).toMatch(/sin problemas/i);
  });

  it('paridad: el informe de producción nombra exactamente los avisos que registra el arranque', () => {
    const env = { DATABASE_URL: 'x', WEB_COVERAGE_DATABASE_URL: 'y', NEW_ZONES_DAILY_CAP: '5' };
    const issues = classifyEnv(env, 'production');
    const report = renderEnvReport(issues, 'production');

    for (const issue of issues) {
      expect(report).toContain(issue.name);
    }
    expect(issues.some((issue) => issue.severity === 'production-warning')).toBe(true);
  });
});

describe('parseEnvTarget — argumentos de env:check', () => {
  it('sin argumentos el destino es local', () => {
    expect(parseEnvTarget([])).toBe('local');
  });

  it('acepta --target local|production en las dos formas', () => {
    expect(parseEnvTarget(['--target', 'production'])).toBe('production');
    expect(parseEnvTarget(['--target=local'])).toBe('local');
    expect(parseEnvTarget(['--', '--target', 'production'])).toBe('production');
  });

  it('un destino desconocido o sin valor no se adivina: devuelve null', () => {
    expect(parseEnvTarget(['--target', 'staging'])).toBeNull();
    expect(parseEnvTarget(['--target'])).toBeNull();
    expect(parseEnvTarget(['--objetivo', 'production'])).toBeNull();
  });
});

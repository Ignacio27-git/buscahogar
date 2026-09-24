// ROADMAP 1.15 (security-hardening, spec #261 "apps/web's Three Hand-Rolled
// Env Reads Become One Zod Schema...", diseño decisión 078) — env.ts es EL
// lector canónico; `db.test.ts`/`coverage-env.test.ts` siguen probando el
// contrato re-exportado desde `db.ts`/`coverage.ts` (sin cambios, mismas
// clases/mensajes). Esta suite se centra en lo NUEVO: el parseo perezoso —
// en el momento de la LLAMADA, nunca en la carga del módulo — y
// `readClientLimitConfig()`, cuyo required-ness depende de CLIENT_IP_HEADER
// (D7 x D1a, decisión 078).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MissingClientLimitConfigError,
  MissingDatabaseUrlError,
  readClientLimitConfig,
  readDatabaseUrl,
} from '../src/server/env.js';

const LIMIT_VARS = [
  'CLIENT_IP_HEADER',
  'CLIENT_IP_HMAC_KEY',
  'COVERAGE_PER_CLIENT_DAILY_CAP',
  'PROXY_RATE_LIMIT_MAX',
  'PROXY_RATE_LIMIT_WINDOW_SECONDS',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of LIMIT_VARS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of LIMIT_VARS) {
    if (snapshot[key] === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe('env.ts — parseo perezoso, en el momento de la llamada (decisión 078)', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('nunca cachea: cambiar la variable entre dos llamadas cambia el resultado devuelto', () => {
    delete process.env.DATABASE_URL;
    expect(() => readDatabaseUrl()).toThrow(MissingDatabaseUrlError);

    process.env.DATABASE_URL = 'postgres://example/db';
    expect(readDatabaseUrl()).toBe('postgres://example/db');
  });

  it("una cadena vacía se trata igual que ausencia ('' = absent)", () => {
    process.env.DATABASE_URL = '';
    expect(() => readDatabaseUrl()).toThrow(MissingDatabaseUrlError);
  });
});

describe('readClientLimitConfig — required-ness depende de CLIENT_IP_HEADER (D7 x D1a)', () => {
  const snapshot = snapshotEnv();

  beforeEach(() => {
    for (const key of LIMIT_VARS) {
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    restoreEnv(snapshot);
  });

  it('CLIENT_IP_HEADER ausente -> null, sin importar el resto (ni siquiera valores inválidos)', () => {
    process.env.PROXY_RATE_LIMIT_MAX = 'no-es-un-numero';
    expect(readClientLimitConfig()).toBeNull();
  });

  it("CLIENT_IP_HEADER === '' se trata como ausente -> null, aunque el resto sea inválido", () => {
    process.env.CLIENT_IP_HEADER = '';
    process.env.CLIENT_IP_HMAC_KEY = 'corta';
    expect(readClientLimitConfig()).toBeNull();
  });

  it('CLIENT_IP_HEADER definida pero falta CLIENT_IP_HMAC_KEY -> falla alto, nunca un valor por defecto', () => {
    process.env.CLIENT_IP_HEADER = 'x-forwarded-for';
    process.env.COVERAGE_PER_CLIENT_DAILY_CAP = '5';
    process.env.PROXY_RATE_LIMIT_MAX = '10';
    process.env.PROXY_RATE_LIMIT_WINDOW_SECONDS = '60';
    expect(() => readClientLimitConfig()).toThrow(MissingClientLimitConfigError);
  });

  it('CLIENT_IP_HEADER definida y las cuatro válidas -> configuración completa, header en minúsculas', () => {
    process.env.CLIENT_IP_HEADER = 'X-Forwarded-For';
    process.env.CLIENT_IP_HMAC_KEY = 'a'.repeat(32);
    process.env.COVERAGE_PER_CLIENT_DAILY_CAP = '5';
    process.env.PROXY_RATE_LIMIT_MAX = '10';
    process.env.PROXY_RATE_LIMIT_WINDOW_SECONDS = '60';

    expect(readClientLimitConfig()).toEqual({
      headerName: 'x-forwarded-for',
      hmacKey: 'a'.repeat(32),
      dailyCap: 5,
      proxyMax: 10,
      proxyWindowSeconds: 60,
    });
  });
});

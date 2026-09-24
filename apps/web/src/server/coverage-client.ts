// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage Limit
// Is Enforced In PostgreSQL...", diseño decisión 076/078) — resuelve la
// identidad de cliente (cabecera confiable, `next/headers`) a la clave
// opaca y el tope que `resolveCoverageForZone` (`./coverage.js`) necesita.
//
// `readClientLimitConfig()` se llama SIEMPRE PRIMERO: cuando el limitador
// está deshabilitado, la función devuelve `null` sin invocar `headers()` en
// absoluto — validador notes (obs #263): "page test asserts the next/
// headers mock is NOT called when CLIENT_IP_HEADER is unset", probado
// directamente en `test/coverage-client.test.ts`.
//
// Guardado con `import 'server-only'` (diseño decisión 081, tarea 2.23):
// este módulo resuelve la identidad de cliente contra un secreto
// (`CLIENT_IP_HMAC_KEY`) — el stub + alias de vitest (tareas 2.20-2.21) ya
// existen, así que el guard no rompe `test/coverage-client.test.ts`.
import 'server-only';
import { headers } from 'next/headers';

import { parseTrustedClientIp, UNKNOWN_CLIENT_IDENTITY } from '@buscahogar/core';

import { hmacClientKey } from './client-identity';
import { readClientLimitConfig } from './env';

export interface CoverageClientLimit {
  readonly keyHash: string;
  readonly dailyCap: number;
}

export async function resolveCoverageClientLimit(): Promise<CoverageClientLimit | null> {
  const limitConfig = readClientLimitConfig();
  if (limitConfig === null) {
    return null;
  }

  const headerList = await headers();
  const rawHeaderValue = headerList.get(limitConfig.headerName);
  const identity = parseTrustedClientIp(rawHeaderValue) ?? UNKNOWN_CLIENT_IDENTITY;
  const keyHash = hmacClientKey(identity, limitConfig.hmacKey);

  return { keyHash, dailyCap: limitConfig.dailyCap };
}

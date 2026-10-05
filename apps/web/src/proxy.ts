// ROADMAP 1.15 (security-hardening, spec #261 "request-rate-limiting",
// diseño decisión 074/075) — Proxy de Next.js 16: convención que renombra
// `middleware.ts` (`middleware` deprecado, ver docs/AI-NOTES.md sobre
// `unstable_doesMiddlewareMatch` vs `unstable_doesProxyMatch`). Excluye
// estáticos/imagen/favicon vía `config.matcher` (spec #261 "excludes static
// assets"); pasa de largo sin tocar el limitador cuando CLIENT_IP_HEADER no
// está configurada (D1a).
//
// UN limitador por PROCESO, a nivel de módulo (D1b, limitación conocida
// documentada en DECISIONS) — exactamente el "global" que la propia
// documentación de Next.js advierte evitar en Proxy, aceptado a propósito.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseTrustedClientIp, UNKNOWN_CLIENT_IDENTITY } from '@buscahogar/core';

import { hmacClientKey } from './server/client-identity';
import { readClientLimitConfig } from './server/env';
import { createProxyRateLimiter } from './server/proxy-rate-limit';

const limiter = createProxyRateLimiter();

export function proxy(request: NextRequest): NextResponse {
  const limitConfig = readClientLimitConfig();
  if (limitConfig === null) {
    return NextResponse.next();
  }

  // spec #261 "A missing, comma-separated, or invalid header value falls
  // into one shared unknown bucket, never exempt" (decisión 075): el
  // fallback a UNKNOWN_CLIENT_IDENTITY nunca deja pasar sin límite.
  const rawHeaderValue = request.headers.get(limitConfig.headerName);
  const identity = parseTrustedClientIp(rawHeaderValue) ?? UNKNOWN_CLIENT_IDENTITY;
  // Decisión 076: el limitador en memoria se indexa por la clave HMAC, igual
  // que la cuota en PostgreSQL; la IP en claro nunca se guarda como clave.
  const clientKey = hmacClientKey(identity, limitConfig.hmacKey);

  const result = limiter.hit(clientKey, Date.now(), {
    max: limitConfig.proxyMax,
    windowMs: limitConfig.proxyWindowSeconds * 1000,
  });

  if (!result.allowed) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    });
  }

  return NextResponse.next();
}

export const config = {
  // spec #261 "Static asset and image-optimization requests are never
  // limited": excluye `_next/static`, `_next/image` y el favicon —
  // negative-lookahead, mismo patrón recomendado por la guía oficial de CSP
  // de Next.js. D.5 (decisión 149) añade los iconos de la convención `app/`
  // (`icon.svg`, `apple-icon.png`, con o sin extensión). Se compara solo el
  // pathname (la query `?hash` nunca llega a la expresión) y cada alternativa
  // se ancla con `$` para que `/iconography` o `/icons/x` sigan limitados.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon(?:\\.svg)?$|apple-icon(?:\\.png)?$).*)'],
};

// ROADMAP 1.15 (security-hardening, spec #261 "request-rate-limiting",
// diseño decisión 074/075) — Proxy de Next.js 16: convención que renombra
// `middleware.ts` (`middleware` deprecado, ver docs/AI-NOTES.md sobre
// `unstable_doesMiddlewareMatch` vs `unstable_doesProxyMatch`). Excluye
// estáticos/imagen/favicon vía `config.matcher` (spec #261 "excludes static
// assets"); pasa de largo sin tocar el limitador cuando CLIENT_IP_HEADER no
// está configurada (D1a).
//
// ROADMAP 3.4 (decisión 255, enmienda la 074): el limitador cuenta sobre `proxy_rate_limit` en PostgreSQL,
// COMPARTIDO por todas las instancias, con fallo abierto y plazo total de 200 ms (R1.7, PD9). El runtime
// del proxy es Node.js (Next 16), así que `pg` es viable. La instancia del limitador es una por
// proceso y solo guarda el estrangulado del registro de errores; los contadores viven en la base de datos.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseTrustedClientIp, UNKNOWN_CLIENT_IDENTITY } from '@buscahogar/core';

import { hmacClientKey } from './server/client-identity';
import { readClientLimitConfig } from './server/env';
import { proxyLimiterStore } from './server/proxy-limiter-db';
import { createProxyRateLimiter } from './server/proxy-rate-limit';
import { buildRateLimitResponse } from './server/rate-limit-page';

const limiter = createProxyRateLimiter({ store: proxyLimiterStore });

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const limitConfig = readClientLimitConfig();
  if (limitConfig === null) {
    return NextResponse.next();
  }

  // spec #261 "A missing, comma-separated, or invalid header value falls
  // into one shared unknown bucket, never exempt" (decisión 075): el
  // fallback a UNKNOWN_CLIENT_IDENTITY nunca deja pasar sin límite.
  // ROADMAP 3.4 (R3.1, R3.2): en Vercel `CLIENT_IP_HEADER=x-forwarded-for` lleva UNA sola IP; una lista
  // con comas no se interpreta (no se confía en ninguna entrada) y cae en `unknown`.
  const rawHeaderValue = request.headers.get(limitConfig.headerName);
  const identity = parseTrustedClientIp(rawHeaderValue) ?? UNKNOWN_CLIENT_IDENTITY;
  // Decisión 076: el limitador se indexa por la clave HMAC, igual que la cuota en PostgreSQL; la IP en
  // claro nunca se guarda como clave.
  const clientKey = hmacClientKey(identity, limitConfig.hmacKey);

  const result = await limiter.hit(clientKey, Date.now(), {
    max: limitConfig.proxyMax,
    windowMs: limitConfig.proxyWindowSeconds * 1000,
  });

  if (!result.allowed) {
    // D.14 (decisión 189): página HTML en español; `Retry-After` conserva el valor del limitador.
    const { body, headers } = buildRateLimitResponse(result.retryAfterSeconds);
    return new NextResponse(body, { status: 429, headers });
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
  // se ancla con `$` para que `/iconography` o `/icons/x` sigan limitados. ROADMAP 3.4 (R1.8) añade
  // `api/health$`: la comprobación de salud no se limita ni escribe en `proxy_rate_limit`.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon(?:\\.svg)?$|apple-icon(?:\\.png)?$|api/health$).*)'],
};

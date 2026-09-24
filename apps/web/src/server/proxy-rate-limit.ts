// ROADMAP 1.15 (security-hardening, spec #261 "The Proxy Limiter Uses A
// Fixed Window, Responds 429+Retry-After, Excludes Static Assets", diseño
// decisión 074/D1b) — envoltorio EN MEMORIA sobre la política pura
// `evaluateFixedWindow` (packages/core). Limitación conocida y documentada
// (docs/DECISIONS.md, decisión 074): un `Map` por PROCESO — no funciona
// correctamente con más de una instancia/contenedor (aviso oficial de
// Next.js: "no confíes en módulos compartidos o globals para Proxy"),
// aceptada a propósito (D1b).
//
// Fábrica, no un singleton a nivel de módulo (a diferencia de
// `db.ts`/`coverage-db.ts`): cada instancia posee su PROPIO `Map`, así que
// los tests pueden crear una limpia sin interferir entre sí ni depender de
// reiniciar un estado de módulo compartido. `proxy.ts` (misma unidad) crea
// UNA sola instancia a nivel de módulo — ese es el "global" que D1b ya
// documenta como limitación conocida.
import { evaluateFixedWindow } from '@buscahogar/core';
import type { FixedWindowState } from '@buscahogar/core';

// PROXY-REACHABLE (diseño decisión 081): sin `import 'server-only'` — el
// runtime de Proxy no admite ese guard.

export interface ProxyRateLimitParams {
  readonly max: number;
  readonly windowMs: number;
}

export interface ProxyRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface ProxyRateLimiter {
  hit(key: string, nowMs: number, params: ProxyRateLimitParams): ProxyRateLimitResult;
  readonly size: number;
}

export function createProxyRateLimiter(): ProxyRateLimiter {
  const buckets = new Map<string, FixedWindowState>();

  return {
    hit(key, nowMs, params): ProxyRateLimitResult {
      const prev = buckets.get(key);
      const result = evaluateFixedWindow(prev, nowMs, params);
      buckets.set(key, result.state);

      // Poda: cualquier entrada (de CUALQUIER clave) cuya ventana ya cerró
      // respecto al instante actual se borra — así el mapa nunca crece sin
      // límite mientras el proceso vive (spec #261, escenario "map
      // pruning").
      for (const [otherKey, state] of buckets) {
        if (nowMs - state.windowStart >= params.windowMs) {
          buckets.delete(otherKey);
        }
      }

      return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds };
    },
    get size(): number {
      return buckets.size;
    },
  };
}

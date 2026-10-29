// ROADMAP 1.15 (security-hardening, spec #261, diseño decisión 074) + ROADMAP 3.4 (decisión 255, D4/D5,
// PD9; R1.7) — limitador de ventana fija del proxy sobre un almacén COMPARTIDO en PostgreSQL
// (`@buscahogar/db`: `createPgProxyRateLimitStore`). Sustituye al `Map` por proceso de la decisión 074:
// con varias instancias (Vercel) cada una contaba por su cuenta.
//
// La DECISIÓN (permitida / `Retry-After`) la toma `fixedWindowVerdict` del núcleo sobre el estado que
// devuelve el almacén, la misma lógica que `evaluateFixedWindow`.
//
// FALLO ABIERTO (R1.7, PD9): un limitador que tumba el sitio cuando su base de datos tiembla es peor que
// el abuso que evita. Si el almacén rechaza, tarda más de `deadlineMs` (200 ms en total: obtener
// conexión + consulta) o no se puede ni crear, la petición SE PERMITE, nunca hay 5xx, y se emite UNA
// línea JSON de error (sin clave, IP, URL ni mensaje del error) como mucho cada 10 s por instancia. Una
// consulta abandonada puede aún llegar a ejecutarse: el sobreconteo es inocuo. Las cuotas de Idealista
// (decisión 248) y por cliente de cobertura (077) conservan su propio cierre en fallo (fail-closed).
//
// Fábrica, no singleton: cada instancia posee su estado de estrangulado de registros, y los tests crean
// una limpia. `proxy.ts` crea UNA a nivel de módulo.
//
// PROXY-REACHABLE (diseño decisión 081): sin `import 'server-only'` — el runtime de Proxy no admite ese
// guard.
import { fixedWindowVerdict } from '@buscahogar/core';
import type { FixedWindowParams, FixedWindowState } from '@buscahogar/core';

export type ProxyRateLimitParams = FixedWindowParams;

export interface ProxyRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

// Mismo contrato que `ProxyRateLimitStore` de `@buscahogar/db`, redeclarado para que los tests de este
// módulo no necesiten el paquete de base de datos (un doble estructural basta).
export interface ProxyRateLimitStore {
  hit(key: string, nowMs: number, params: ProxyRateLimitParams): Promise<FixedWindowState>;
}

export interface ProxyRateLimiter {
  hit(key: string, nowMs: number, params: ProxyRateLimitParams): Promise<ProxyRateLimitResult>;
}

export interface ProxyRateLimiterOptions {
  readonly store: ProxyRateLimitStore;
  // Plazo total para obtener la respuesta del almacén. 200 ms por defecto (R1.7).
  readonly deadlineMs?: number;
  // Destino de la línea de error ya serializada. Por defecto `console.error` (stderr de la función).
  readonly log?: (line: string) => void;
  // Reloj de estrangulado. Por defecto `Date.now`.
  readonly now?: () => number;
}

export const PROXY_LIMITER_DEADLINE_MS = 200;
export const PROXY_LIMITER_LOG_INTERVAL_MS = 10_000;

const FAIL_OPEN: ProxyRateLimitResult = { allowed: true, retryAfterSeconds: 0 };
const TIMEOUT = Symbol('proxy-limiter-timeout');

export function createProxyRateLimiter(options: ProxyRateLimiterOptions): ProxyRateLimiter {
  const { store } = options;
  const deadlineMs = options.deadlineMs ?? PROXY_LIMITER_DEADLINE_MS;
  const log = options.log ?? ((line: string): void => {
    console.error(line);
  });
  const now = options.now ?? Date.now;
  let lastLoggedAt: number | undefined;

  function logUnavailable(reason: 'timeout' | 'error'): void {
    const current = now();
    if (lastLoggedAt !== undefined && current - lastLoggedAt < PROXY_LIMITER_LOG_INTERVAL_MS) {
      return;
    }
    lastLoggedAt = current;
    // Solo estos campos: nunca la clave, la IP, la URL de conexión ni el mensaje del error.
    log(
      JSON.stringify({
        ts: new Date(current).toISOString(),
        level: 'error',
        component: 'proxy-limiter',
        msg: 'store-unavailable',
        reason,
      })
    );
  }

  return {
    async hit(key, nowMs, params): Promise<ProxyRateLimitResult> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // `store.hit` dentro de una función async: un fallo síncrono (p. ej. credencial ausente al
        // crear el pool) se convierte en rechazo y cae en el mismo camino de fallo abierto.
        const query = (async (): Promise<FixedWindowState> => store.hit(key, nowMs, params))();
        // Si el plazo gana, el rechazo tardío de `query` ya no tiene quien lo espere: se absorbe.
        query.catch(() => undefined);
        const deadline = new Promise<typeof TIMEOUT>((resolve) => {
          timer = setTimeout(() => {
            resolve(TIMEOUT);
          }, deadlineMs);
        });
        const state = await Promise.race([query, deadline]);
        if (state === TIMEOUT) {
          logUnavailable('timeout');
          return FAIL_OPEN;
        }
        return fixedWindowVerdict(state, nowMs, params);
      } catch {
        logUnavailable('error');
        return FAIL_OPEN;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

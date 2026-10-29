// ROADMAP 3.4 (decisión 258, D16; R6.5) — latido (dead-man's-switch). Tras un tick que terminó sin lanzar, un
// GET a `HEARTBEAT_URL` (monitor externo: si dejan de llegar latidos, el monitor avisa de que el worker cayó).
//
// Regla: se hace el ping solo si han pasado ≥ `minIntervalMs` desde el ÚLTIMO INTENTO (también el fallido: no se
// martillea a un monitor caído); cada ping toma una plaza del presupuesto de salida del tick (`OutboundBudget`) y
// si no queda ninguna no llama (y no gasta el intervalo). Tiempo límite explícito (`AbortSignal.timeout`), sin
// seguir redirecciones, y un fallo se registra y NUNCA es fatal. La URL es secreta (suele llevar un uuid): no se
// registra nunca, ni siquiera dentro del mensaje de un error de red.
import type { JsonLogger } from './json-logger.js';
import type { OutboundBudget } from './outbound-budget.js';

export const DEFAULT_HEARTBEAT_MIN_INTERVAL_MS = 60_000;
export const HEARTBEAT_TIMEOUT_MS = 5000;

export type HeartbeatFetch = (
  url: string,
  init: { readonly method: 'GET'; readonly redirect: 'error'; readonly signal: AbortSignal }
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export interface HeartbeatOptions {
  readonly url: string | undefined;
  readonly minIntervalMs: number;
  readonly timeoutMs: number;
  readonly fetchFn: HeartbeatFetch;
  readonly now: () => number;
  readonly log: JsonLogger;
}

export interface Heartbeat {
  afterSuccessfulTick(budget: OutboundBudget): Promise<void>;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function createHeartbeat(options: HeartbeatOptions): Heartbeat {
  const { url } = options;
  let lastAttemptAt: number | undefined;

  return {
    async afterSuccessfulTick(budget: OutboundBudget): Promise<void> {
      if (url === undefined) {
        return;
      }
      if (lastAttemptAt !== undefined && options.now() - lastAttemptAt < options.minIntervalMs) {
        return;
      }
      if (!budget.tryTake()) {
        return;
      }
      lastAttemptAt = options.now();
      try {
        const response = await options.fetchFn(url, {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (!response.ok) {
          options.log.warn('heartbeat-failed', { reason: 'http', status: response.status });
        }
      } catch (error) {
        if (isTimeout(error)) {
          options.log.warn('heartbeat-failed', { reason: 'timeout', timeout_ms: options.timeoutMs });
        } else {
          options.log.warn('heartbeat-failed', { reason: 'error' });
        }
      }
    },
  };
}

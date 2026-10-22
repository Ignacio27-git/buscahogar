// ROADMAP 3.4 (decisión 258, D15) — conexión inicial a la base con backoff 1 → 60 s y 8 intentos como máximo
// (código de salida 3 si sigue inaccesible). Acotado y abortable: nunca un bucle abierto.
import { backoffDelayMs } from './backoff.js';

export interface StartupBackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly shouldContinue: () => boolean;
  readonly onRetry: (event: { readonly attempt: number; readonly delayMs: number; readonly message: string }) => void;
}

export const STARTUP_DEFAULTS = { baseMs: 1000, maxMs: 60_000, maxAttempts: 8 } as const;

export async function connectWithBackoff(
  attempt: () => Promise<void>,
  options: StartupBackoffOptions
): Promise<'connected' | 'unreachable' | 'stopped'> {
  for (let n = 1; n <= options.maxAttempts; n += 1) {
    if (!options.shouldContinue()) {
      return 'stopped';
    }
    try {
      await attempt();
      return 'connected';
    } catch (error) {
      if (n === options.maxAttempts) {
        return 'unreachable';
      }
      const delayMs = backoffDelayMs(n, options.baseMs, options.maxMs);
      options.onRetry({ attempt: n, delayMs, message: error instanceof Error ? error.message : String(error) });
      await options.sleep(delayMs);
    }
  }
  return 'unreachable';
}

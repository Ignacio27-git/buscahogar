// ROADMAP 3.4 (decisión 258, D15; R6.3) — supervisor EN PROCESO del worker. Una excepción inesperada de
// `runCoverageWorker` no mata el proceso a la primera: se espera `min(1 s · 2^n, 300 s)` (interrumpible) y se
// reintenta; la cuenta de caídas seguidas se reinicia si la ejecución aguantó ≥ 600 s, y a la décima caída
// consecutiva se rinde (el llamador sale con código 1; la política de reinicio del host es la segunda línea).
// Una ejecución que TERMINA sin lanzar es una parada ordenada y no se reintenta. Todo (espera, reloj, parada)
// se inyecta, así que se prueba sin temporizadores reales.
import { backoffDelayMs } from './backoff.js';

export interface CrashEvent {
  readonly consecutive: number;
  // null = se rinde: no habrá otra espera.
  readonly delayMs: number | null;
  readonly message: string;
}

export interface SupervisorOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly stableResetMs: number;
  readonly maxConsecutive: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly shouldContinue: () => boolean;
  readonly onCrash: (event: CrashEvent) => void;
}

export const SUPERVISOR_DEFAULTS = {
  baseMs: 1000,
  maxMs: 300_000,
  stableResetMs: 600_000,
  maxConsecutive: 10,
} as const;

export async function runSupervised(
  run: () => Promise<void>,
  options: SupervisorOptions
): Promise<'stopped' | 'gave-up'> {
  let consecutive = 0;

  while (options.shouldContinue()) {
    const startedAt = options.now();
    try {
      await run();
      return 'stopped';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.now() - startedAt >= options.stableResetMs) {
        consecutive = 0;
      }
      consecutive += 1;
      if (consecutive >= options.maxConsecutive) {
        options.onCrash({ consecutive, delayMs: null, message });
        return 'gave-up';
      }
      const delayMs = backoffDelayMs(consecutive, options.baseMs, options.maxMs);
      options.onCrash({ consecutive, delayMs, message });
      await options.sleep(delayMs);
    }
  }
  return 'stopped';
}

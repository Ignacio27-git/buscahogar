// ROADMAP 3.4 (decisión 258, D14; R6.2) — controlador de apagado del worker. Primera señal: se pide parar
// (el bucle y el barrido lo consultan con `requested()`, las esperas se interrumpen con `signal`) y arranca el
// plazo `WORKER_STOP_GRACE_MS`; si vence antes de terminar, salida forzada con código 1. Segunda señal:
// salida forzada con código 1 al instante. `exit` se inyecta: en producción es `process.exit`.
import type { JsonLogger } from './json-logger.js';

export const FORCED_EXIT_CODE = 1;

export interface ShutdownOptions {
  readonly graceMs: number;
  readonly log: JsonLogger;
  readonly exit: (code: number) => void;
}

export interface ShutdownController {
  readonly signal: AbortSignal;
  requested(): boolean;
  request(source: string): void;
  // El plazo se conoce tras leer el entorno, pero las señales pueden llegar antes: se ajusta sin recrear.
  setGraceMs(graceMs: number): void;
  // Parada limpia terminada: cancela el plazo para que no se fuerce una salida con el trabajo ya cerrado.
  dispose(): void;
}

export function createShutdown(options: ShutdownOptions): ShutdownController {
  const controller = new AbortController();
  let graceMs = options.graceMs;
  let timer: NodeJS.Timeout | undefined;

  function clear(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return {
    signal: controller.signal,
    requested: (): boolean => controller.signal.aborted,
    setGraceMs: (value: number): void => {
      graceMs = value;
    },
    dispose: clear,
    request: (source: string): void => {
      if (controller.signal.aborted) {
        clear();
        options.log.fatal('shutdown-forced', { signal: source });
        options.exit(FORCED_EXIT_CODE);
        return;
      }
      controller.abort();
      options.log.info('shutdown-requested', { signal: source, grace_ms: graceMs });
      timer = setTimeout(() => {
        timer = undefined;
        options.log.fatal('shutdown-grace-expired', { grace_ms: graceMs });
        options.exit(FORCED_EXIT_CODE);
      }, graceMs);
    },
  };
}

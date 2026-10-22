// ROADMAP 3.4 (decisión 258, D14) — espera que se interrumpe al abortar la señal de apagado: el worker no
// puede quedarse dormido `POLL_INTERVAL_MS` ni un backoff de 300 s con un SIGTERM pendiente. Resuelve (no
// rechaza) al abortar: quien espera comprueba después si debe seguir (`shouldContinue`).
export function createAbortableSleep(signal: AbortSignal): (ms: number) => Promise<void> {
  return (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
}

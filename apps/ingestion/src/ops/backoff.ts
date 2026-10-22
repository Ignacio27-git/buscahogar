// ROADMAP 3.4 (decisión 258, D15) — retardo exponencial acotado compartido por el supervisor y el backoff de
// arranque: `min(base · 2^(n-1), tope)` para el intento n ≥ 1 (1 → base, 2 → 2·base…).
export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

// D.13b (decisión 184) — tope de reintentos de un coverage_job. Una sola fuente: el worker de
// ingesta lo usa para decidir si vuelve a seleccionar un job `failed` y la web para decidir qué le
// cuenta a quien espera. Antes lo fijaba `MAX_ATTEMPTS` por entorno en el worker, que la web no veía.
export const COVERAGE_JOB_MAX_ATTEMPTS = 3;

// ¿Quedan reintentos? Refleja la selección del worker: un job `failed` solo se vuelve a coger
// mientras `attempts < máximo`.
export function hasRetriesLeft(attempts: number): boolean {
  return attempts < COVERAGE_JOB_MAX_ATTEMPTS;
}

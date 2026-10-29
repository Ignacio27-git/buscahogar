// D.10 (decisión 178) — fecha en dd/mm/aaaa del día UTC. Extraída de
// `source-list.tsx` para que la lista de fuentes y el histórico de precios
// compartan una única regla.
//
// Getters UTC, no locales: las fechas llegan de Postgres
// (`timestamp with time zone`) y el runtime de test/CI no debe influir en
// qué día cae la medianoche de un fixture.
export function formatUtcDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

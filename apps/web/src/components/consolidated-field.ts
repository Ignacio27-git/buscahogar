// ROADMAP 1.12 (diseño D8, corregido por arbitraje obs #193 AR-8) — función
// pura: qué mostrar para un atributo consolidado que puede ser NULL (un
// ganador de consolidación puede no tener el dato, decisión 053). DOS
// estados, nunca tres: `sources` no lleva copia por-fuente de los atributos
// consolidados, así que distinguir "NULL pero alguna fuente lo tiene" de
// "nadie lo tiene" no es observable con la forma actual — el arbitraje
// rechazó ensanchar `sources` solo para esa distinción cosmética.
export type ConsolidatedField<T> = { readonly kind: 'value'; readonly value: T } | { readonly kind: 'not-consolidated' };

export function resolveConsolidatedField<T>(headerValue: T | null): ConsolidatedField<T> {
  if (headerValue === null) {
    return { kind: 'not-consolidated' };
  }
  return { kind: 'value', value: headerValue };
}

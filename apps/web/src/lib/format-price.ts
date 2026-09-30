// ROADMAP 2.6 (decisión 119) — formato de precio compartido. Antes estaba
// duplicado en result-card, property-header y source-list; ahora lo usan
// también las etiquetas de los marcadores del mapa. `null` (sin precio) da un
// marcador de posición definido, nunca "null" ni "NaN".
export function formatPriceCents(cents: number | null): string {
  if (cents === null) {
    return 'Precio no disponible';
  }
  return `${(cents / 100).toLocaleString('es-ES')} €`;
}

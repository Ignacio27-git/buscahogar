// ROADMAP 2.6 (decisión 119) — formato de precio compartido. Antes estaba
// duplicado en result-card, property-header y source-list; ahora lo usan
// también las etiquetas de los marcadores del mapa. `null` (sin precio) da un
// marcador de posición definido, nunca "null" ni "NaN".
export function formatPriceCents(cents: number | null): string {
  if (cents === null) {
    return 'Precio no disponible';
  }
  // D.18 (decisión 220) — es-ES omite el punto en cuatro cifras (regla de la RAE para
  // números); en un precio se agrupa siempre («1.180 €»). Superficie y radio no pasan por aquí.
  return `${(cents / 100).toLocaleString('es-ES', { useGrouping: 'always' })} €`;
}

// D.10 (decisión 178) — variación entre dos precios consecutivos del
// histórico: «−50 € (−5,6 %)» / «+15 € (+1,8 %)». Signo explícito (U+2212 para
// el menos, nunca el guion), importe por `formatPriceCents`, porcentaje con
// una decimal (sin ella si es entero) y espacio duro antes del %. Una
// magnitud porcentual 0 se muestra «< 0,1 %»; sin porcentaje (precio previo 0)
// queda solo el importe.
const MINUS = '−';
const NBSP = ' ';

function formatPercentTenths(percentTenths: number): string {
  if (percentTenths === 0) {
    return `< 0,1${NBSP}%`;
  }
  const sign = percentTenths < 0 ? MINUS : '+';
  const magnitude = Math.abs(percentTenths);
  const whole = Math.floor(magnitude / 10);
  const tenth = magnitude % 10;
  const number = tenth === 0 ? String(whole) : `${String(whole)},${String(tenth)}`;
  return `${sign}${number}${NBSP}%`;
}

export function formatPriceChange(deltaCents: number, percentTenths: number | null): string {
  const sign = deltaCents < 0 ? MINUS : '+';
  const amount = `${sign}${formatPriceCents(Math.abs(deltaCents))}`;
  if (percentTenths === null) {
    return amount;
  }
  return `${amount} (${formatPercentTenths(percentTenths)})`;
}

// ROADMAP 3.3 (decisión 248; R7, R8; diseño D5, D6b) — reglas PURAS del techo
// mensual de peticiones por carril. La sentencia SQL de `reserveRequestBudget`
// (packages/db) implementa exactamente esta regla; el test de base de datos
// recorre los mismos casos contra ambas.
//
// El techo se aplica sobre el gasto TOTAL del mes (no sobre un contador por
// carril): el batch, el refresco y la verificación de presencia comparten el
// fondo `total - reserva`; solo la demanda de usuario (on-demand, incluidos los
// jobs de presweep promovidos) puede gastar la reserva y llega hasta `total`.
// Consecuencia asumida (PD12): un batch grande puede agotar `total - reserva` y
// dejar sin margen al refresco el resto del mes.

export type QuotaLane = 'on-demand' | 'refresh' | 'batch';

// Estado mensual mínimo que necesitan las reglas: cifras del registro de cuota.
export interface MonthlyLedgerState {
  readonly totalCap: number;
  readonly reserve: number;
  // Peticiones de búsqueda ya gastadas en el mes, de todos los carriles.
  readonly searchRequests: number;
}

// Techo del gasto total del mes para el carril.
export function laneCeiling(lane: QuotaLane, state: Pick<MonthlyLedgerState, 'totalCap' | 'reserve'>): number {
  return lane === 'on-demand' ? state.totalCap : state.totalCap - state.reserve;
}

// Margen que le queda al carril, nunca negativo: el gasto a demanda dentro de
// la reserva puede dejar el gasto total por encima del techo del batch.
export function laneRemaining(lane: QuotaLane, state: MonthlyLedgerState): number {
  return Math.max(0, laneCeiling(lane, state) - state.searchRequests);
}

// Peticiones concedidas ante una solicitud de `requested` (entero >= 1).
// - batch: concesión PARCIAL, `min(pedido, margen)`; 0 si no queda margen (D6b).
// - on-demand y refresco: EXACTA, todo lo pedido o nada (como hoy).
export function monthlyGrant(lane: QuotaLane, requested: number, state: MonthlyLedgerState): number {
  const remaining = laneRemaining(lane, state);
  if (lane === 'batch') {
    return Math.min(requested, remaining);
  }
  return requested <= remaining ? requested : 0;
}

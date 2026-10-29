// ROADMAP 3.4 (decisión 258, D16/D17; R6.5, R7.4) — tope EXPLÍCITO de llamadas salientes por tick. El latido
// (y, en S6, Telegram) toman una plaza antes de cada llamada y, si no queda ninguna, no llaman: ningún bucle
// de envío es ilimitado. Un presupuesto nuevo por tick (`MAX_OUTBOUND_CALLS_PER_TICK`, 4 por defecto).
export interface OutboundBudget {
  tryTake(): boolean;
  remaining(): number;
}

export const DEFAULT_MAX_OUTBOUND_CALLS_PER_TICK = 4;

export function createOutboundBudget(max: number): OutboundBudget {
  if (!Number.isInteger(max) || max < 0) {
    throw new Error(`createOutboundBudget: el tope de llamadas salientes debe ser un entero ≥ 0 (recibido ${String(max)}).`);
  }
  let left = max;
  return {
    tryTake: (): boolean => {
      if (left === 0) {
        return false;
      }
      left -= 1;
      return true;
    },
    remaining: (): number => left,
  };
}

// Paso 1.6 — presupuesto de peticiones por barrido (diseño D4). Un único
// objeto con dos contadores y un `spend` de entrada: si algún día resulta
// que el token SÍ consume cuota de búsqueda, el cambio queda confinado al
// cuerpo de esta función y a su propio test — ningún punto de llamada,
// puerto, fuente ni cursor cambia.
//
// `spend` recibe el cursor de reanudación en el propio punto de llamada
// para que el lanzamiento sea atómico con la comprobación — sin hueco entre
// un `canSpend` y un `spend` separados, y sin catch-and-rethrow.
import { SweepBudgetExhaustedError } from './errors.js';

export type RequestKind = 'search' | 'token';

export interface BudgetSnapshot {
  readonly search: number;
  readonly token: number;
}

export interface SweepBudget {
  spend(kind: RequestKind, context: { readonly resumeCursor: string }): void;
  snapshot(): BudgetSnapshot;
}

// Tope duro del token, independiente de maxSearchRequestsPerSweep: se
// adquiere una vez por barrido y se cachea (D4).
const TOKEN_CAP = 1;

export function createSweepBudget(maxSearchRequestsPerSweep: number): SweepBudget {
  const counts: { search: number; token: number } = { search: 0, token: 0 };

  return {
    spend(kind: RequestKind, context: { readonly resumeCursor: string }): void {
      const cap = kind === 'search' ? maxSearchRequestsPerSweep : TOKEN_CAP;
      if (counts[kind] >= cap) {
        throw new SweepBudgetExhaustedError(context.resumeCursor, { search: counts.search, token: counts.token });
      }
      counts[kind] += 1;
    },
    snapshot(): BudgetSnapshot {
      return { search: counts.search, token: counts.token };
    },
  };
}

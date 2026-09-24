// Sonda de la API de Idealista (paso 1.5) — contador de peticiones de red.
//
// Dos contadores independientes con un tope duro de 1 cada uno. `spend()` se
// llama siempre en la línea inmediatamente anterior a su `await fetch(...)`
// correspondiente (D6), así que una petición que falla tras salir de la
// máquina sigue contando: "una petición fallida nunca reporta cero"
// (REQ-COUNT). El lanzamiento al superar el tope convierte "creemos que no
// hay una segunda llamada" en "una segunda llamada es imposible sin una
// excepción no capturada", que también cubre el caso de recursión que la
// regla estática de ESLint (D5) no puede ver.

export type RequestKind = 'token' | 'search';

export interface LedgerSnapshot {
  readonly token: number;
  readonly search: number;
}

export interface RequestLedger {
  spend(kind: RequestKind): void;
  snapshot(): LedgerSnapshot;
}

const REQUEST_CAP = 1;

export function createRequestLedger(): RequestLedger {
  const counts: { token: number; search: number } = { token: 0, search: 0 };

  return {
    spend(kind: RequestKind): void {
      if (counts[kind] >= REQUEST_CAP) {
        throw new Error(
          `Tope de peticiones alcanzado para "${kind}": máximo ${String(REQUEST_CAP)} por ejecución.`
        );
      }
      counts[kind] += 1;
    },
    snapshot(): LedgerSnapshot {
      return { token: counts.token, search: counts.search };
    },
  };
}

// Los dos contadores se informan SIEMPRE por separado y nunca se suman: no está
// documentado si la petición de token consume cuota de búsqueda, así que una cifra
// agregada afirmaría algo que no sabemos. Solo la línea de búsquedas es dinero.
export function renderLedgerReport(snapshot: LedgerSnapshot, outcome: 'ok' | 'error'): string {
  const lines = [
    'Peticiones de red de esta ejecución:',
    `  token     POST /oauth/token      ${String(snapshot.token)}  — impacto en cuota: DESCONOCIDO (ninguna fuente lo documenta)`,
    `  búsqueda  POST /3.5/es/search    ${String(snapshot.search)}  — impacto en cuota: SÍ, facturable`,
    `  Peticiones de búsqueda facturables en esta ejecución: ${String(snapshot.search)}.`,
  ];

  if (outcome === 'error') {
    lines.push(
      '',
      '  AVISO: la ejecución terminó con error tras enviar la petición de búsqueda.',
      '  Una petición fallida puede haberse facturado igualmente: cuenta 1 búsqueda como gastada.',
      '  Para saber si la petición de token consume cuota, compara el contador del portal de',
      '  partner justo antes y justo después de esta ejecución. La sonda no puede verlo.'
    );
  }

  return lines.join('\n');
}

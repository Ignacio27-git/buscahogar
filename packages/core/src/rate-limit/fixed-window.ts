// ROADMAP 1.15 (security-hardening, decisión 074) — ventana fija PURA, sin
// reloj real ni estado propio: recibe el estado previo (o `undefined` en la
// primera petición) y el instante actual ya resueltos por el llamador. El
// limitador en memoria de `apps/web/src/proxy.ts` (D1b, PR2) es quien posee
// el `Map<clave, FixedWindowState>` y el reloj — esta función nunca lee
// `Date.now()` por sí misma, exactamente por lo que resulta trivial de
// probar sin mocks (mismo principio que `evaluateFixedWindow` en el diseño,
// §Interfaces, obs #262).
export interface FixedWindowState {
  readonly count: number;
  readonly windowStart: number;
}

export interface FixedWindowParams {
  readonly max: number;
  readonly windowMs: number;
}

export interface FixedWindowResult {
  readonly allowed: boolean;
  readonly state: FixedWindowState;
  readonly retryAfterSeconds: number;
}

export interface FixedWindowVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

// ROADMAP 3.4 (decisión 255, D3) — veredicto puro sobre el estado YA actualizado de la ventana
// (la petición evaluada incluida en `count`). Lo comparten el limitador en memoria
// (`evaluateFixedWindow`) y el limitador compartido en PostgreSQL, que calcula el estado en SQL y
// reutiliza esta función para decidir: así la decisión (límite, Retry-After) no se duplica.
export function fixedWindowVerdict(
  state: FixedWindowState,
  nowMs: number,
  params: FixedWindowParams
): FixedWindowVerdict {
  const allowed = state.count <= params.max;
  const windowEnd = state.windowStart + params.windowMs;
  const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((windowEnd - nowMs) / 1000));
  return { allowed, retryAfterSeconds };
}

export function evaluateFixedWindow(
  prev: FixedWindowState | undefined,
  nowMs: number,
  params: FixedWindowParams
): FixedWindowResult {
  // Rollover: sin estado previo, o el instante actual cayó fuera de la
  // ventana previa — se abre una ventana nueva con conteo 1, nunca hereda el
  // conteo agotado de la ventana anterior.
  const withinPreviousWindow = prev !== undefined && nowMs - prev.windowStart < params.windowMs;
  const windowStart = withinPreviousWindow ? prev.windowStart : nowMs;
  const count = withinPreviousWindow ? prev.count + 1 : 1;

  // El contador SIEMPRE se actualiza, incluso en la petición rechazada — el
  // estado devuelto refleja la petición evaluada de verdad, nunca un
  // cortocircuito que descarta la petición sin contarla.
  const state: FixedWindowState = { count, windowStart };
  return { ...fixedWindowVerdict(state, nowMs, params), state };
}

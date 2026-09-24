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

  const allowed = count <= params.max;
  // El contador SIEMPRE se actualiza, incluso en la petición rechazada — el
  // estado devuelto refleja la petición evaluada de verdad, nunca un
  // cortocircuito que descarta la petición sin contarla.
  const windowEnd = windowStart + params.windowMs;
  const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((windowEnd - nowMs) / 1000));

  return { allowed, state: { count, windowStart }, retryAfterSeconds };
}

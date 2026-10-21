// ROADMAP 1.15 (security-hardening, diseño decisión 074) — ventana fija PURA
// para el limitador en memoria de `apps/web/src/proxy.ts` (D1b): sin reloj
// real, sin `Map` ni ningún estado propio — recibe el estado previo y el
// instante actual como parámetros, para que el llamador (PR2) decida dónde
// vive el `Map` de estado por clave. Mismo espíritu que `evaluateFixedWindow`
// del diseño (§Interfaces, obs #262): una única función pura, trivialmente
// testeable sin mocks.
import { describe, expect, it } from 'vitest';

import { evaluateFixedWindow, fixedWindowVerdict } from '../src/rate-limit/fixed-window.js';
import type { FixedWindowState } from '../src/rate-limit/fixed-window.js';

const PARAMS = { max: 3, windowMs: 60_000 };

describe('evaluateFixedWindow — primera petición sin estado previo', () => {
  it('sin estado previo, la primera petición siempre se permite y abre una ventana nueva', () => {
    const result = evaluateFixedWindow(undefined, 1_000, PARAMS);

    expect(result.allowed).toBe(true);
    expect(result.state).toEqual({ count: 1, windowStart: 1_000 });
    expect(result.retryAfterSeconds).toBe(0);
  });
});

describe('evaluateFixedWindow — límite exacto (max-boundary)', () => {
  it('la petición número max, dentro de la misma ventana, todavía se permite', () => {
    const afterFirst = evaluateFixedWindow(undefined, 0, PARAMS);
    const afterSecond = evaluateFixedWindow(afterFirst.state, 10_000, PARAMS);
    const afterThird = evaluateFixedWindow(afterSecond.state, 20_000, PARAMS);

    expect(afterThird.allowed).toBe(true);
    expect(afterThird.state.count).toBe(3);
  });

  it('la petición max+1, dentro de la misma ventana, se RECHAZA', () => {
    let state: FixedWindowState | undefined;
    for (const nowMs of [0, 10_000, 20_000]) {
      state = evaluateFixedWindow(state, nowMs, PARAMS).state;
    }

    const fourth = evaluateFixedWindow(state, 30_000, PARAMS);

    expect(fourth.allowed).toBe(false);
    // El contador SIGUE incrementando aunque se rechace — evidencia de que
    // la petición rechazada fue evaluada de verdad, no un cortocircuito que
    // nunca ejecuta la lógica de conteo (regla "no ghost loop / trivial GREEN").
    expect(fourth.state.count).toBe(4);
  });
});

describe('evaluateFixedWindow — Retry-After', () => {
  it('una petición rechazada calcula retryAfterSeconds como el tiempo restante hasta que la ventana cierre', () => {
    let state: FixedWindowState | undefined;
    for (const nowMs of [0, 1_000, 2_000]) {
      state = evaluateFixedWindow(state, nowMs, PARAMS).state;
    }

    // Ventana abierta en 0, cierra en 60_000; la 4ª petición llega en 55_000,
    // así que quedan 5_000 ms == 5 s hasta el cierre.
    const fourth = evaluateFixedWindow(state, 55_000, PARAMS);

    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBe(5);
  });

  it('una petición PERMITIDA siempre reporta retryAfterSeconds en 0 (nada que esperar)', () => {
    const result = evaluateFixedWindow(undefined, 12_345, PARAMS);

    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});

describe('evaluateFixedWindow — rollover de ventana', () => {
  it('una petición que llega exactamente windowMs después del inicio abre una ventana NUEVA (nunca hereda el conteo agotado)', () => {
    let state: FixedWindowState | undefined;
    for (const nowMs of [0, 1_000, 2_000]) {
      state = evaluateFixedWindow(state, nowMs, PARAMS).state;
    }
    // La ventana está agotada (count=3=max) si la siguiente petición llegara
    // dentro de la misma ventana (prueba de control, no forma parte de la
    // aserción final).
    const stillDenied = evaluateFixedWindow(state, 10_000, PARAMS);
    expect(stillDenied.allowed).toBe(false);

    const rollover = evaluateFixedWindow(state, 60_000, PARAMS);

    expect(rollover.allowed).toBe(true);
    expect(rollover.state).toEqual({ count: 1, windowStart: 60_000 });
  });

  it('una petición mucho más tarde que la ventana anterior también hace rollover, no solo justo en el borde', () => {
    const first = evaluateFixedWindow(undefined, 0, PARAMS);

    const muchLater = evaluateFixedWindow(first.state, 500_000, PARAMS);

    expect(muchLater.allowed).toBe(true);
    expect(muchLater.state).toEqual({ count: 1, windowStart: 500_000 });
  });
});

// ROADMAP 3.4 (decisión 255, D3) — el veredicto se extrae para que el limitador compartido en
// PostgreSQL (que calcula el estado en SQL) y el de memoria usen LA MISMA decisión.
describe('fixedWindowVerdict — paridad con evaluateFixedWindow', () => {
  it('permitida: count <= max reporta allowed y retryAfterSeconds 0', () => {
    const verdict = fixedWindowVerdict({ count: 3, windowStart: 1_000 }, 5_000, PARAMS);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('rechazada: count > max reporta los segundos que faltan hasta cerrar la ventana (redondeo hacia arriba)', () => {
    const verdict = fixedWindowVerdict({ count: 4, windowStart: 0 }, 55_500, PARAMS);

    expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 5 });
  });

  it('rechazada con la ventana ya cerrada nunca devuelve un Retry-After negativo', () => {
    const verdict = fixedWindowVerdict({ count: 4, windowStart: 0 }, 90_000, PARAMS);

    expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 0 });
  });

  it('evaluateFixedWindow devuelve exactamente el veredicto de su propio estado, en una secuencia completa con rollover', () => {
    let state: FixedWindowState | undefined;
    for (const nowMs of [0, 1_000, 2_000, 3_000, 4_000, 59_999, 60_000, 60_001]) {
      const result = evaluateFixedWindow(state, nowMs, PARAMS);
      expect({ allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds }).toEqual(
        fixedWindowVerdict(result.state, nowMs, PARAMS)
      );
      state = result.state;
    }
    // Control de que la secuencia cubrió rechazos Y el rollover (no es un bucle trivial).
    expect(state).toEqual({ count: 2, windowStart: 60_000 });
  });
});

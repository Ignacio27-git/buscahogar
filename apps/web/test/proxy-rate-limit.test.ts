// ROADMAP 1.15 (security-hardening, spec #261 "The Proxy Limiter Uses A
// Fixed Window, Responds 429+Retry-After...", diseño decisión 074/D1b) —
// reloj SIEMPRE inyectado (`nowMs`), nunca `Date.now()` dentro de la
// prueba: mismo principio que `packages/core/test/fixed-window.test.ts`.
import { describe, expect, it } from 'vitest';

import { createProxyRateLimiter } from '../src/server/proxy-rate-limit.js';

describe('createProxyRateLimiter (spec #261 "proxy limiter", decisión 074)', () => {
  it('permite hasta max peticiones dentro de la ventana', () => {
    const limiter = createProxyRateLimiter();
    const params = { max: 2, windowMs: 1000 };
    expect(limiter.hit('a', 0, params).allowed).toBe(true);
    expect(limiter.hit('a', 100, params).allowed).toBe(true);
  });

  it('rechaza la petición que supera max, con Retry-After > 0', () => {
    const limiter = createProxyRateLimiter();
    const params = { max: 2, windowMs: 1000 };
    limiter.hit('a', 0, params);
    limiter.hit('a', 100, params);
    const third = limiter.hit('a', 200, params);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('cada clave (bucket) se cuenta de forma independiente', () => {
    const limiter = createProxyRateLimiter();
    const params = { max: 1, windowMs: 1000 };
    expect(limiter.hit('a', 0, params).allowed).toBe(true);
    expect(limiter.hit('unknown', 0, params).allowed).toBe(true); // clave distinta, contador propio
  });

  it('una ventana nueva reinicia el conteo de la misma clave', () => {
    const limiter = createProxyRateLimiter();
    const params = { max: 1, windowMs: 1000 };
    limiter.hit('a', 0, params);
    expect(limiter.hit('a', 0, params).allowed).toBe(false); // agotada dentro de la misma ventana
    expect(limiter.hit('a', 2000, params).allowed).toBe(true); // ventana nueva, rollover
  });

  it('poda: una entrada de una ventana ya cerrada se elimina del mapa cuando llega actividad posterior', () => {
    const limiter = createProxyRateLimiter();
    const params = { max: 5, windowMs: 1000 };
    limiter.hit('a', 0, params);
    expect(limiter.size).toBe(1);
    limiter.hit('b', 5000, params); // la ventana de 'a' (windowStart=0) ya cerró para nowMs=5000
    expect(limiter.size).toBe(1); // 'a' podada, solo queda 'b'
  });
});

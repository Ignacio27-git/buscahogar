// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, S-ZRS-18) — lectura
// del entorno del worker de cobertura: la fracción del tope diario que puede
// gastar el refresco (`REFRESH_BUDGET_FRACTION`, en [0, 1]) y la cadencia del
// mantenimiento (`MAINTENANCE_EVERY_TICKS`, entero positivo) se validan con
// Zod y nunca toman un valor por defecto que gaste cuota sin que el operador
// lo pida. `readEnv` es pura (recibe el entorno), así que se prueba sin tocar
// el proceso real.
import { COVERAGE_JOB_MAX_ATTEMPTS } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import { readEnv, WorkerEnvError } from '../scripts/coverage-worker.js';

const BASE_ENV: Record<string, string> = {
  IDEALISTA_API_KEY: 'k',
  IDEALISTA_API_SECRET: 's',
  DATABASE_URL: 'postgresql://owner@localhost:5432/buscahogar',
  DAILY_SEARCH_CAP: '100',
  BLOCKING_RADIUS_METERS: '300',
  BLOCKING_PRICE_BAND_CENTS: '2500000',
  BLOCKING_SURFACE_TOLERANCE_M2: '10',
};

describe('readEnv — REFRESH_BUDGET_FRACTION (S-ZRS-18)', () => {
  it('ausente: el refresco queda DESACTIVADO (fracción 0) — nunca un valor que gaste cuota por defecto', () => {
    expect(readEnv(BASE_ENV).options.refreshBudgetFraction).toBe(0);
  });

  it.each([
    ['0', 0],
    ['0.2', 0.2],
    ['1', 1],
    ['0.05', 0.05],
  ])('"%s" es válida y se interpreta como %f', (raw, expected) => {
    expect(readEnv({ ...BASE_ENV, REFRESH_BUDGET_FRACTION: raw }).options.refreshBudgetFraction).toBe(expected);
  });

  it.each([['-0.1'], ['1.5'], ['NaN'], ['abc'], [''], ['  '], ['Infinity']])(
    '"%s" se rechaza con un error de configuración que nombra la variable',
    (raw) => {
      expect(() => readEnv({ ...BASE_ENV, REFRESH_BUDGET_FRACTION: raw })).toThrow(WorkerEnvError);
      expect(() => readEnv({ ...BASE_ENV, REFRESH_BUDGET_FRACTION: raw })).toThrow(/REFRESH_BUDGET_FRACTION/);
    }
  );
});

describe('readEnv — MAINTENANCE_EVERY_TICKS', () => {
  it('ausente: usa el valor por defecto documentado (20 ticks)', () => {
    expect(readEnv(BASE_ENV).options.maintenanceEveryTicks).toBe(20);
  });

  it('un entero positivo válido se respeta', () => {
    expect(readEnv({ ...BASE_ENV, MAINTENANCE_EVERY_TICKS: '5' }).options.maintenanceEveryTicks).toBe(5);
  });

  it.each([['0'], ['-3'], ['1.5'], ['abc']])('"%s" se rechaza (se espera un entero positivo)', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, MAINTENANCE_EVERY_TICKS: raw })).toThrow(/MAINTENANCE_EVERY_TICKS/);
  });
});

// ROADMAP 2.5 (S3; decisión 105) — verificación de presencia por `adIds`: el
// tope de peticiones por tick y el margen de radio son decisiones del
// operador con valores por defecto PRUDENTES (pocas peticiones: la cuota es
// mensual y limitada). Se validan con Zod como el resto de variables.
describe('readEnv — MAX_VERIFICATION_REQUESTS_PER_TICK', () => {
  it('ausente: por defecto 2 peticiones de verificación por tick', () => {
    expect(readEnv(BASE_ENV).options.maxVerificationRequestsPerTick).toBe(2);
  });

  it('un entero positivo válido se respeta', () => {
    expect(readEnv({ ...BASE_ENV, MAX_VERIFICATION_REQUESTS_PER_TICK: '5' }).options.maxVerificationRequestsPerTick).toBe(5);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc']])('"%s" se rechaza (se espera un entero positivo)', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, MAX_VERIFICATION_REQUESTS_PER_TICK: raw })).toThrow(WorkerEnvError);
    expect(() => readEnv({ ...BASE_ENV, MAX_VERIFICATION_REQUESTS_PER_TICK: raw })).toThrow(
      /MAX_VERIFICATION_REQUESTS_PER_TICK/
    );
  });
});

describe('readEnv — VERIFICATION_RADIUS_MARGIN_M', () => {
  it('ausente: por defecto 500 m', () => {
    expect(readEnv(BASE_ENV).verificationRadiusMarginM).toBe(500);
  });

  it.each([
    ['0', 0],
    ['250', 250],
  ])('"%s" es válido (entero no negativo) y se interpreta como %i', (raw, expected) => {
    expect(readEnv({ ...BASE_ENV, VERIFICATION_RADIUS_MARGIN_M: raw }).verificationRadiusMarginM).toBe(expected);
  });

  it.each([['-1'], ['1.5'], ['abc'], ['']])('"%s" se rechaza (se espera un entero no negativo)', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, VERIFICATION_RADIUS_MARGIN_M: raw })).toThrow(/VERIFICATION_RADIUS_MARGIN_M/);
  });
});

// D.13b (decisión 184) — el tope de reintentos sale de `@buscahogar/core` (lo comparte la web para
// decidir el aviso de un job fallido); la variable `MAX_ATTEMPTS` ya no existe y se ignora.
describe('readEnv — tope de reintentos compartido (D.13b)', () => {
  it('sin MAX_ATTEMPTS usa la constante de core', () => {
    expect(readEnv(BASE_ENV).options.maxAttempts).toBe(COVERAGE_JOB_MAX_ATTEMPTS);
  });

  it.each([['9'], ['1'], ['abc'], ['']])('MAX_ATTEMPTS="%s" se ignora por completo', (raw) => {
    const env = readEnv({ ...BASE_ENV, MAX_ATTEMPTS: raw });
    expect(env.options.maxAttempts).toBe(COVERAGE_JOB_MAX_ATTEMPTS);
  });
});

// ROADMAP 3.3 (prescan-top-cities, PR2; decisión 252) — un único worker sirve las dos
// operaciones: cada job lleva la suya. `OPERATION` se RECHAZA al arrancar (un valor
// heredado de un `.env` antiguo no se ignora en silencio: ocultaría un gasto de
// `sale` que el operador cree estar acotando por proceso).
describe('readEnv — OPERATION retirada (decisión 252)', () => {
  it.each([['sale'], ['rent'], ['']])('OPERATION="%s" se rechaza con un error que nombra la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, OPERATION: raw })).toThrow(WorkerEnvError);
    expect(() => readEnv({ ...BASE_ENV, OPERATION: raw })).toThrow(/OPERATION/);
    expect(() => readEnv({ ...BASE_ENV, OPERATION: raw })).toThrow(/retirada|cada job/);
  });

  it('sin OPERATION el entorno es válido y las opciones del worker no llevan ninguna operación fija', () => {
    const env = readEnv(BASE_ENV);

    expect(env.options.dailySearchCap).toBe(100);
    expect(Object.keys(env.options)).not.toContain('operation');
  });
});

// ROADMAP 3.4 (decisión 258, D14, D16; R6.2, R6.5) — variables del modo producción: plazo de parada, latido y
// tope de llamadas salientes por tick. Todas opcionales y con valor por defecto documentado; un valor inválido
// falla al arrancar nombrando la variable (NF3), nunca repitiendo su valor (la URL del latido es secreta).
describe('readEnv — WORKER_STOP_GRACE_MS (D14)', () => {
  it('ausente: 8000 ms por defecto', () => {
    expect(readEnv(BASE_ENV).stopGraceMs).toBe(8000);
  });

  it.each([
    ['1000', 1000],
    ['25000', 25_000],
  ])('"%s" es válida (%d ms)', (raw, expected) => {
    expect(readEnv({ ...BASE_ENV, WORKER_STOP_GRACE_MS: raw }).stopGraceMs).toBe(expected);
  });

  it.each([['0'], ['-5'], ['abc'], ['1.5'], ['']])('"%s" se rechaza nombrando la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, WORKER_STOP_GRACE_MS: raw })).toThrow(WorkerEnvError);
    expect(() => readEnv({ ...BASE_ENV, WORKER_STOP_GRACE_MS: raw })).toThrow(/WORKER_STOP_GRACE_MS/);
  });
});

describe('readEnv — HEARTBEAT_URL / HEARTBEAT_MIN_INTERVAL_MS (D16)', () => {
  it('ausentes: sin latido y mínimo de 60 000 ms', () => {
    const env = readEnv(BASE_ENV);

    expect(env.heartbeat).toEqual({ url: undefined, minIntervalMs: 60_000 });
  });

  it('una URL https válida se conserva tal cual', () => {
    const env = readEnv({ ...BASE_ENV, HEARTBEAT_URL: 'https://hc-ping.example/abc-123?x=1' });

    expect(env.heartbeat.url).toBe('https://hc-ping.example/abc-123?x=1');
  });

  it('una URL en blanco equivale a no configurada', () => {
    expect(readEnv({ ...BASE_ENV, HEARTBEAT_URL: '   ' }).heartbeat.url).toBeUndefined();
  });

  it.each([['http://hc-ping.example/abc'], ['hc-ping.example/abc'], ['ftp://x.example/'], ['https://']])(
    '"%s" se rechaza nombrando la variable y sin repetir su valor',
    (raw) => {
      expect(() => readEnv({ ...BASE_ENV, HEARTBEAT_URL: raw })).toThrow(WorkerEnvError);
      expect(() => readEnv({ ...BASE_ENV, HEARTBEAT_URL: raw })).toThrow(/HEARTBEAT_URL/);
      expect(() => readEnv({ ...BASE_ENV, HEARTBEAT_URL: raw })).not.toThrow(new RegExp(raw.replace(/[.*+?^${}()|[\]\/]/g, '\$&')));
    }
  );

  it('el intervalo mínimo acepta 0 (un latido por tick) y enteros positivos', () => {
    expect(readEnv({ ...BASE_ENV, HEARTBEAT_MIN_INTERVAL_MS: '0' }).heartbeat.minIntervalMs).toBe(0);
    expect(readEnv({ ...BASE_ENV, HEARTBEAT_MIN_INTERVAL_MS: '120000' }).heartbeat.minIntervalMs).toBe(120_000);
  });

  it.each([['-1'], ['x'], ['1.5'], ['']])('el intervalo "%s" se rechaza nombrando la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, HEARTBEAT_MIN_INTERVAL_MS: raw })).toThrow(/HEARTBEAT_MIN_INTERVAL_MS/);
  });
});

describe('readEnv — MAX_OUTBOUND_CALLS_PER_TICK (D16, D17)', () => {
  it('ausente: 4 por defecto', () => {
    expect(readEnv(BASE_ENV).options.maxOutboundCallsPerTick).toBe(4);
  });

  it('acepta 0 (sin llamadas salientes) y enteros positivos', () => {
    expect(readEnv({ ...BASE_ENV, MAX_OUTBOUND_CALLS_PER_TICK: '0' }).options.maxOutboundCallsPerTick).toBe(0);
    expect(readEnv({ ...BASE_ENV, MAX_OUTBOUND_CALLS_PER_TICK: '6' }).options.maxOutboundCallsPerTick).toBe(6);
  });

  it.each([['-1'], ['many'], ['2.5'], ['']])('"%s" se rechaza nombrando la variable', (raw) => {
    expect(() => readEnv({ ...BASE_ENV, MAX_OUTBOUND_CALLS_PER_TICK: raw })).toThrow(/MAX_OUTBOUND_CALLS_PER_TICK/);
  });
});

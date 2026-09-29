// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, S-ZRS-18) — lectura
// del entorno del worker de cobertura: la fracción del tope diario que puede
// gastar el refresco (`REFRESH_BUDGET_FRACTION`, en [0, 1]) y la cadencia del
// mantenimiento (`MAINTENANCE_EVERY_TICKS`, entero positivo) se validan con
// Zod y nunca toman un valor por defecto que gaste cuota sin que el operador
// lo pida. `readEnv` es pura (recibe el entorno), así que se prueba sin tocar
// el proceso real.
import { describe, expect, it } from 'vitest';

import { readEnv, WorkerEnvError } from '../scripts/coverage-worker.js';

const BASE_ENV: Record<string, string> = {
  IDEALISTA_API_KEY: 'k',
  IDEALISTA_API_SECRET: 's',
  DATABASE_URL: 'postgresql://owner@localhost:5432/buscahogar',
  OPERATION: 'sale',
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

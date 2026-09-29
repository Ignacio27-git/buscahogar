// ROADMAP 2.5 (refresh-retention-policy, S1) — política pura de cadencia de
// refresco: cuántos días sin demanda decide si una zona se refresca cada
// semana, cada mes, queda en espera o se purga. Sin reloj real, sin DB.
import { describe, expect, it } from 'vitest';

import {
  classifyZoneCadence,
  isRefreshDue,
  MONTHLY_MAX_DEMAND_AGE_DAYS,
  MONTHLY_REFRESH_INTERVAL_DAYS,
  PURGE_DEMAND_AGE_DAYS,
  SIGNAL_PURGE_MAX_ROWS_PER_TICK,
  SIGNAL_RETENTION_DAYS,
  WEEKLY_MAX_DEMAND_AGE_DAYS,
  WEEKLY_REFRESH_INTERVAL_DAYS,
} from '../src/retention/policy.js';

const DAY_SECONDS = 86_400;

describe('classifyZoneCadence — fronteras normativas (S-ZRS-1)', () => {
  it.each([
    [0, 'weekly'],
    [1, 'weekly'],
    [30, 'weekly'],
    [31, 'monthly'],
    [90, 'monthly'],
    [91, 'on-hold'],
    [179, 'on-hold'],
    [180, 'purge'],
    [181, 'purge'],
  ] as const)('d = %i días desde la última demanda -> %s', (days, expected) => {
    expect(classifyZoneCadence(days)).toBe(expected);
  });

  it('las constantes con nombre fijan los umbrales 30/90/180 y los intervalos 7/30 (ZRS-7)', () => {
    expect(WEEKLY_MAX_DEMAND_AGE_DAYS).toBe(30);
    expect(MONTHLY_MAX_DEMAND_AGE_DAYS).toBe(90);
    expect(PURGE_DEMAND_AGE_DAYS).toBe(180);
    expect(WEEKLY_REFRESH_INTERVAL_DAYS).toBe(7);
    expect(MONTHLY_REFRESH_INTERVAL_DAYS).toBe(30);
  });
});

describe('retención de señales de demanda (RP-12, A6)', () => {
  it('las señales caducan a los 180 días y la purga de un tick está acotada a 5.000 filas', () => {
    expect(SIGNAL_RETENTION_DAYS).toBe(180);
    expect(SIGNAL_PURGE_MAX_ROWS_PER_TICK).toBe(5_000);
  });

  it('una señal caduca exactamente cuando la zona ya sería purgable: el horizonte coincide con PURGE_DEMAND_AGE_DAYS', () => {
    expect(SIGNAL_RETENTION_DAYS).toBe(PURGE_DEMAND_AGE_DAYS);
    expect(classifyZoneCadence(SIGNAL_RETENTION_DAYS)).toBe('purge');
  });
});

describe('isRefreshDue — vencimiento por cadencia (S-ZRS-2, 3, 4)', () => {
  it('semanal: 6d23h desde el último barrido NO vence; exactamente 7 días SÍ', () => {
    expect(isRefreshDue('weekly', 7 * DAY_SECONDS - 3_600)).toBe(false);
    expect(isRefreshDue('weekly', 7 * DAY_SECONDS)).toBe(true);
  });

  it('mensual: 29 días NO vence; 30 días o más SÍ', () => {
    expect(isRefreshDue('monthly', 29 * DAY_SECONDS)).toBe(false);
    expect(isRefreshDue('monthly', 30 * DAY_SECONDS)).toBe(true);
    expect(isRefreshDue('monthly', 45 * DAY_SECONDS)).toBe(true);
  });

  it('en espera y purga NUNCA vencen, aunque el último barrido sea de hace 400 días', () => {
    expect(isRefreshDue('on-hold', 400 * DAY_SECONDS)).toBe(false);
    expect(isRefreshDue('purge', 400 * DAY_SECONDS)).toBe(false);
  });

  it('una zona sin barrido registrado (null) con cadencia semanal o mensual vence; en espera no', () => {
    expect(isRefreshDue('weekly', null)).toBe(true);
    expect(isRefreshDue('monthly', null)).toBe(true);
    expect(isRefreshDue('on-hold', null)).toBe(false);
  });
});

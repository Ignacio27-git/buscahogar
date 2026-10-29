// ROADMAP 3.3 (decisión 248; R3, D13; S3.2, S3.3) — argumentos de `set-monthly-quota`.
// `--total` y `--reserve` son OBLIGATORIOS, enteros no negativos (total > 0) y con
// `reserva < total`; la reserva 0 solo se acepta si se pasa de forma explícita. Todo
// rechazo ocurre ANTES de tocar la base de datos: el registro queda intacto.
import { describe, expect, it } from 'vitest';

import { parseSetMonthlyQuotaArgs, SetMonthlyQuotaArgsError } from '../src/quota/set-monthly-quota.js';

// Reloj inyectado: el mes por defecto es el mes UTC en curso, sin depender del reloj real.
const NOW = new Date('2026-10-20T10:00:00Z');

describe('parseSetMonthlyQuotaArgs — válidos', () => {
  it('total y reserva obligatorios; el mes por defecto es el mes UTC en curso (día 1)', () => {
    expect(parseSetMonthlyQuotaArgs(['--total', '1000', '--reserve', '200'], NOW)).toEqual({
      totalCap: 1000,
      reserve: 200,
      month: '2026-10-01',
    });
  });

  it('el mes por defecto se calcula en UTC aunque la hora local sea ya el mes siguiente', () => {
    const lateOnLastDay = new Date('2026-10-31T23:30:00Z');
    expect(parseSetMonthlyQuotaArgs(['--total', '10', '--reserve', '1'], lateOnLastDay).month).toBe('2026-10-01');
    const firstInstant = new Date('2026-11-01T00:00:00Z');
    expect(parseSetMonthlyQuotaArgs(['--total', '10', '--reserve', '1'], firstInstant).month).toBe('2026-11-01');
  });

  it('S3.3: reserva 0 explícita con total > 0 se acepta', () => {
    expect(parseSetMonthlyQuotaArgs(['--total', '500', '--reserve', '0'], NOW)).toEqual({
      totalCap: 500,
      reserve: 0,
      month: '2026-10-01',
    });
  });

  it('--month YYYY-MM fija el mes (día 1)', () => {
    expect(parseSetMonthlyQuotaArgs(['--total', '100', '--reserve', '30', '--month', '2026-12'], NOW).month).toBe('2026-12-01');
    expect(parseSetMonthlyQuotaArgs(['--total', '100', '--reserve', '30', '--month', '2027-01'], NOW).month).toBe('2027-01-01');
  });

  it('el total puede ser 1 con reserva 0 (la regla es 0 <= reserva < total)', () => {
    expect(parseSetMonthlyQuotaArgs(['--total', '1', '--reserve', '0'], NOW)).toMatchObject({ totalCap: 1, reserve: 0 });
  });
});

describe('parseSetMonthlyQuotaArgs — rechazos (S3.2)', () => {
  it.each<[string, readonly string[], RegExp]>([
    ['falta --reserve (sin default silencioso a 0)', ['--total', '1000'], /--reserve/],
    ['falta --total', ['--reserve', '10'], /--total/],
    ['faltan ambos', [], /--total|--reserve/],
    ['reserva igual al total', ['--total', '100', '--reserve', '100'], /menor que el total/],
    ['reserva mayor que el total', ['--total', '100', '--reserve', '150'], /menor que el total/],
    ['total 0', ['--total', '0', '--reserve', '0'], /--total/],
    ['total negativo', ['--total=-5', '--reserve', '0'], /--total/],
    ['reserva negativa', ['--total', '100', '--reserve=-1'], /--reserve/],
    ['total no entero (decimal)', ['--total', '10.5', '--reserve', '1'], /--total/],
    ['reserva no entera (decimal)', ['--total', '100', '--reserve', '1.5'], /--reserve/],
    ['total en notación científica', ['--total', '1e3', '--reserve', '1'], /--total/],
    ['total no numérico', ['--total', 'mil', '--reserve', '1'], /--total/],
    ['reserva vacía', ['--total', '100', '--reserve', ''], /--reserve/],
    ['total con signo', ['--total', '+100', '--reserve', '1'], /--total/],
    ['total por encima de int4', ['--total', '2147483648', '--reserve', '1'], /--total/],
    ['mes con formato inválido', ['--total', '100', '--reserve', '30', '--month', '2026-1'], /--month/],
    ['mes 13', ['--total', '100', '--reserve', '30', '--month', '2026-13'], /--month/],
    ['mes con día', ['--total', '100', '--reserve', '30', '--month', '2026-10-01'], /--month/],
    ['flag desconocido', ['--total', '100', '--reserve', '30', '--budget', '5'], /budget/],
  ])('%s', (_name, argv, message) => {
    expect(() => parseSetMonthlyQuotaArgs(argv, NOW)).toThrow(SetMonthlyQuotaArgsError);
    expect(() => parseSetMonthlyQuotaArgs(argv, NOW)).toThrow(message);
  });
});

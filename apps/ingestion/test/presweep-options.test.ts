// ROADMAP 3.3 (decisión 253; R3, D13; S3.1) — argumentos del presweep. `--top`, `--max-requests` (tope de la
// ejecución) y `--max-requests-per-sweep` son OBLIGATORIOS, enteros positivos y SIN valor por defecto: con una
// cuota mensual limitada y de pago, una cifra por defecto sería gasto contra un techo que nadie decidió. Todo
// rechazo ocurre ANTES de abrir ninguna conexión (cero llamadas, cero escrituras en el registro).
import { describe, expect, it } from 'vitest';

import { parsePresweepArgs, PresweepArgsError } from '../src/presweep/presweep-options.js';

const VALID = ['--top', '100', '--max-requests', '500', '--max-requests-per-sweep', '20'];

describe('parsePresweepArgs — válidos', () => {
  it('los tres flags obligatorios se parsean a enteros; --dry-run es falso por defecto', () => {
    expect(parsePresweepArgs(VALID)).toEqual({ top: 100, maxRequests: 500, maxRequestsPerSweep: 20, dryRun: false });
  });

  it('--dry-run lo activa y el orden de los flags no importa', () => {
    expect(
      parsePresweepArgs(['--dry-run', '--max-requests-per-sweep', '5', '--top', '3', '--max-requests', '9'])
    ).toEqual({ top: 3, maxRequests: 9, maxRequestsPerSweep: 5, dryRun: true });
  });

  it('el valor 1 es válido en los tres flags (positivo mínimo)', () => {
    expect(parsePresweepArgs(['--top', '1', '--max-requests', '1', '--max-requests-per-sweep', '1'])).toMatchObject({
      top: 1,
      maxRequests: 1,
      maxRequestsPerSweep: 1,
    });
  });

  it('el tope por barrido puede superar al de la ejecución (el menor manda al conceder)', () => {
    expect(parsePresweepArgs(['--top', '2', '--max-requests', '10', '--max-requests-per-sweep', '50'])).toMatchObject({
      maxRequests: 10,
      maxRequestsPerSweep: 50,
    });
  });
});

describe('parsePresweepArgs — S3.1: faltan o son inválidos', () => {
  it.each([
    ['sin --top', ['--max-requests', '500', '--max-requests-per-sweep', '20'], '--top'],
    ['sin --max-requests', ['--top', '100', '--max-requests-per-sweep', '20'], '--max-requests'],
    ['sin --max-requests-per-sweep', ['--top', '100', '--max-requests', '500'], '--max-requests-per-sweep'],
  ])('%s: error que nombra el flag, sin valor por defecto', (_name, argv, flag) => {
    expect(() => parsePresweepArgs(argv)).toThrow(PresweepArgsError);
    expect(() => parsePresweepArgs(argv)).toThrow(flag);
  });

  it('sin ningún argumento falla', () => {
    expect(() => parsePresweepArgs([])).toThrow(PresweepArgsError);
  });

  it.each([
    ['0', '0'],
    ['negativo', '-5'],
    ['decimal', '1.5'],
    ['texto', 'abc'],
    ['vacío', ''],
    ['con signo', '+5'],
    ['con ceros a la izquierda', '007'],
    ['notación científica', '1e3'],
    ['con separador de miles', '1,000'],
    ['por encima de int4', '2147483648'],
  ])('--top %s (%j) se rechaza', (_name, value) => {
    expect(() => parsePresweepArgs(['--top', value, '--max-requests', '500', '--max-requests-per-sweep', '20'])).toThrow(
      PresweepArgsError
    );
  });

  it.each([
    ['--max-requests', ['--top', '5', '--max-requests', '0', '--max-requests-per-sweep', '20']],
    ['--max-requests', ['--top', '5', '--max-requests', '-1', '--max-requests-per-sweep', '20']],
    ['--max-requests-per-sweep', ['--top', '5', '--max-requests', '10', '--max-requests-per-sweep', '0']],
    ['--max-requests-per-sweep', ['--top', '5', '--max-requests', '10', '--max-requests-per-sweep', '2.5']],
  ])('%s con valor no positivo o no entero se rechaza nombrando el flag', (flag, argv) => {
    expect(() => parsePresweepArgs(argv)).toThrow(PresweepArgsError);
    expect(() => parsePresweepArgs(argv)).toThrow(flag);
  });

  it('un flag desconocido se rechaza (modo estricto), p. ej. un --total que NO es de este comando', () => {
    expect(() => parsePresweepArgs([...VALID, '--total', '100'])).toThrow(PresweepArgsError);
    expect(() => parsePresweepArgs([...VALID, '--reserve', '10'])).toThrow(PresweepArgsError);
  });
});

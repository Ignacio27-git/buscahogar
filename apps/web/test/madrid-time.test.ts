// D.13 (decisión 181) — módulo de hora de Madrid para los avisos de cobertura:
// siguiente medianoche UTC y formato de fecha/hora peninsular, independientes
// de la zona horaria del proceso.
import { describe, expect, it } from 'vitest';

import { formatMadridDateTime, formatMadridTime, nextUtcMidnight } from '../src/lib/madrid-time.js';

function withProcessTimeZone(timeZone: string, run: () => void): void {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

describe('nextUtcMidnight', () => {
  it('devuelve la siguiente medianoche UTC', () => {
    expect(nextUtcMidnight(new Date('2026-10-08T12:05:00Z')).toISOString()).toBe(
      '2026-10-09T00:00:00.000Z'
    );
  });

  it('en la medianoche exacta devuelve la del día siguiente (estrictamente posterior)', () => {
    expect(nextUtcMidnight(new Date('2026-10-09T00:00:00Z')).toISOString()).toBe(
      '2026-10-10T00:00:00.000Z'
    );
  });

  it('cruza el fin de mes y de año', () => {
    expect(nextUtcMidnight(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z'
    );
  });
});

describe('formatMadridDateTime', () => {
  it('formatea fecha media y hora corta en Europe/Madrid (CEST)', () => {
    expect(formatMadridDateTime(new Date('2026-10-08T12:05:00Z'))).toBe('8 oct 2026, 14:05');
  });

  it('usa el horario de invierno (CET) fuera del horario de verano', () => {
    expect(formatMadridDateTime(new Date('2026-12-08T12:05:00Z'))).toBe('8 dic 2026, 13:05');
  });

  it('no depende de la zona horaria del proceso', () => {
    withProcessTimeZone('America/New_York', () => {
      expect(formatMadridDateTime(new Date('2026-10-08T12:05:00Z'))).toBe('8 oct 2026, 14:05');
    });
  });
});

describe('formatMadridTime (hora del reinicio del límite diario)', () => {
  it.each([
    ['2026-10-25T00:00:00Z', '2:00'], // aún CEST (el cambio es a las 01:00Z)
    ['2026-10-26T00:00:00Z', '1:00'], // ya CET
    ['2027-03-28T00:00:00Z', '1:00'], // aún CET (el cambio es a las 01:00Z)
    ['2027-03-29T00:00:00Z', '2:00'], // ya CEST
  ])('la medianoche UTC de %s se muestra como %s', (iso, expected) => {
    expect(formatMadridTime(new Date(iso))).toBe(expected);
  });

  it('no depende de la zona horaria del proceso', () => {
    withProcessTimeZone('America/New_York', () => {
      expect(formatMadridTime(new Date('2026-10-25T00:00:00Z'))).toBe('2:00');
      expect(formatMadridTime(new Date('2026-10-26T00:00:00Z'))).toBe('1:00');
    });
  });
});

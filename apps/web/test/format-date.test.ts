// D.10 — `formatUtcDate` (extraída de source-list.tsx): día UTC en dd/mm/aaaa,
// independiente de la zona horaria del servidor y del visitante.
import { describe, expect, it } from 'vitest';

import { formatUtcDate } from '../src/lib/format-date.js';

describe('formatUtcDate', () => {
  it('formatea el día UTC como dd/mm/aaaa', () => {
    expect(formatUtcDate(new Date('2026-03-04T23:30:00Z'))).toBe('04/03/2026');
  });

  it('rellena día y mes con ceros', () => {
    expect(formatUtcDate(new Date('2026-01-09T00:00:00Z'))).toBe('09/01/2026');
  });

  it('no depende de la zona horaria del proceso', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: el día local sería el 05
    try {
      expect(formatUtcDate(new Date('2026-03-04T23:30:00Z'))).toBe('04/03/2026');
    } finally {
      if (previous === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previous;
      }
    }
  });
});

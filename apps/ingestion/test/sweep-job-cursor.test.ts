// Paso 1.7 — job-cursor.ts (COVERAGE-2, diseño D6): envelope versionado
// {v, area, cursor} sobre coverage_jobs.cursor. Reutiliza InvalidCursorError
// del adaptador de Idealista (1.6, errors.ts) — es la misma clase de fallo
// ("un cursor no se pudo decodificar"), no una nueva.
import { describe, expect, it } from 'vitest';

import { InvalidCursorError } from '../src/sources/idealista/errors.js';
import { decodeJobCursor, encodeJobCursor } from '../src/sweep/job-cursor.js';

describe('encodeJobCursor / decodeJobCursor — round-trip {v:1, area, cursor} (D6)', () => {
  it('round-tripea el cursor del adaptador bajo la misma huella de área', () => {
    const encoded = encodeJobCursor('fingerprint-abc', 'homes:3');
    expect(decodeJobCursor(encoded, 'fingerprint-abc')).toBe('homes:3');
  });

  it('round-tripea distintos cursores sin pérdida', () => {
    const encoded = encodeJobCursor('fingerprint-xyz', 'premises:12');
    expect(decodeJobCursor(encoded, 'fingerprint-xyz')).toBe('premises:12');
  });
});

describe('decodeJobCursor — rechazo, nunca una reanudación por defecto', () => {
  it('rechaza JSON malformado', () => {
    expect(() => decodeJobCursor('{esto no es json', 'fp')).toThrow(InvalidCursorError);
  });

  it('rechaza un envelope con versión "v" desconocida', () => {
    const malformed = JSON.stringify({ v: 2, area: 'fp', cursor: 'homes:1' });
    expect(() => decodeJobCursor(malformed, 'fp')).toThrow(InvalidCursorError);
  });

  it('rechaza un envelope sin el campo "cursor"', () => {
    const malformed = JSON.stringify({ v: 1, area: 'fp' });
    expect(() => decodeJobCursor(malformed, 'fp')).toThrow(InvalidCursorError);
  });

  it('rechaza un envelope sin el campo "area"', () => {
    const malformed = JSON.stringify({ v: 1, cursor: 'homes:1' });
    expect(() => decodeJobCursor(malformed, 'fp')).toThrow(InvalidCursorError);
  });
});

describe('decodeJobCursor — la huella de área debe coincidir (D6)', () => {
  it('rechaza cuando la huella no coincide, en vez de reanudar en silencio el barrido de otra área', () => {
    const encoded = encodeJobCursor('fingerprint-abc', 'homes:3');
    expect(() => decodeJobCursor(encoded, 'fingerprint-DISTINTA')).toThrow(InvalidCursorError);
  });
});

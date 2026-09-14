// Paso 1.6 — codec de cursor "<filtro>:<numPage>" sobre la tupla congelada
// de filtros (R-CURSOR). Por nombre, no por índice: un índice obsoleto
// apuntaría en silencio a otro filtro si la tupla se reordena algún día
// (DECISIONS 032); un nombre desconocido rechaza fuerte.
import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, InvalidCursorError } from '../src/sources/idealista/cursor.js';
import { IDEALISTA_FILTERS } from '../src/sources/idealista/filters.js';

describe('encodeCursor / decodeCursor — round-trip sobre la tupla congelada', () => {
  it.each(IDEALISTA_FILTERS.map((filter, index) => [filter, index + 1] as const))(
    'codifica y decodifica "%s" página %i sin pérdida',
    (filter, page) => {
      const cursor = encodeCursor({ filter, page });
      expect(decodeCursor(cursor)).toEqual({ filter, page });
    }
  );

  it('produce el formato exacto "<filtro>:<numPage>"', () => {
    expect(encodeCursor({ filter: 'premises', page: 3 })).toBe('premises:3');
  });
});

describe('decodeCursor — rechazo, nunca un valor por defecto', () => {
  it('rechaza un filtro desconocido ("garagess", mal escrito) sin caer en homes:1', () => {
    expect(() => decodeCursor('garagess:1')).toThrow(InvalidCursorError);
  });

  it('rechaza una página no positiva ("homes:0") sin caer en homes:1', () => {
    expect(() => decodeCursor('homes:0')).toThrow(InvalidCursorError);
  });

  it('rechaza una página negativa', () => {
    expect(() => decodeCursor('homes:-1')).toThrow(InvalidCursorError);
  });

  it('rechaza una página no entera', () => {
    expect(() => decodeCursor('homes:1.5')).toThrow(InvalidCursorError);
  });

  it('rechaza un cursor sin separador', () => {
    expect(() => decodeCursor('homes')).toThrow(InvalidCursorError);
  });

  it('rechaza una cadena vacía', () => {
    expect(() => decodeCursor('')).toThrow(InvalidCursorError);
  });
});

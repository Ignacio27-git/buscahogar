// ROADMAP 1.13 (diseño DD-3, R7) — R7 es la precondición de apply que NINGÚN
// agente puede saltarse: nadie en este proyecto puede descargar el ZIP de
// 9,59 MB del NGMEP ni leer su fila de cabecera real. El conversor nunca
// referencia un nombre de columna literal en su lógica — lo resuelve a
// través de UN ÚNICA constante exportada, `NGMEP_FIELD_MAP`, que el
// operador rellena una sola vez desde el fichero real en mano. Estos tests
// prueban el 100% de la lógica offline contra un fixture pequeño, propio
// (nunca el fichero real): la cabecera del fixture es deliberadamente
// distinta de `NGMEP_FIELD_MAP` por defecto para demostrar que un mapa sin
// rellenar falla RUIDOSO en vez de encontrar por casualidad las columnas
// equivocadas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MissingNgmepColumnError, NGMEP_FIELD_MAP, parseNgmepCsv } from '../../src/catalogue/ngmep-parse.js';
import type { NgmepFieldMap } from '../../src/catalogue/ngmep-parse.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/ngmep-sample.csv', import.meta.url));
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, 'latin1');

// Mapa REAL para este fixture — simula lo que el operador habría rellenado
// tras inspeccionar el fichero real en mano (R7). Deliberadamente distinto
// de NGMEP_FIELD_MAP (los valores placeholder de ese export nunca deben
// coincidir por accidente).
const FIXTURE_FIELD_MAP: NgmepFieldMap = {
  entityCode: 'CODIGO_ENTIDAD',
  name: 'NOMBRE_ENTIDAD',
  latitude: 'LATITUD',
  longitude: 'LONGITUD',
};

describe('parseNgmepCsv (DD-3, R7) — resuelve la cabecera vía NGMEP_FIELD_MAP, nunca un nombre literal', () => {
  it('parsea las filas del fixture usando el mapa real de columnas', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', FIXTURE_FIELD_MAP);

    expect(rows.length).toBeGreaterThan(0);
    const granada = rows.find((row) => row.entityCode === '18087000000');
    expect(granada).toBeDefined();
    expect(granada?.name).toBe('Granada');
    expect(granada?.latitude).toBeCloseTo(37.177336, 5);
    expect(granada?.longitude).toBeCloseTo(-3.598557, 5);
  });

  it('R7: una columna mapeada ausente del fichero real falla RUIDOSO, nombrando la fila de cabecera vista', () => {
    const brokenMap: NgmepFieldMap = { ...FIXTURE_FIELD_MAP, entityCode: 'COLUMNA_QUE_NO_EXISTE' };

    expect(() => parseNgmepCsv(FIXTURE_CSV, ';', brokenMap)).toThrow(MissingNgmepColumnError);
    try {
      parseNgmepCsv(FIXTURE_CSV, ';', brokenMap);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingNgmepColumnError);
      expect((error as Error).message).toContain('COLUMNA_QUE_NO_EXISTE');
      expect((error as Error).message).toContain('CODIGO_ENTIDAD'); // la cabecera vista de verdad
    }
  });

  it('NGMEP_FIELD_MAP por defecto (sin rellenar por el operador) no coincide con la cabecera real de ningún fichero — falla ruidoso también', () => {
    expect(() => parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP)).toThrow(MissingNgmepColumnError);
  });

  it('ignora líneas en blanco al final del fichero', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV + '\n\n', ';', FIXTURE_FIELD_MAP);
    expect(rows.every((row) => row.entityCode.length > 0)).toBe(true);
  });
});

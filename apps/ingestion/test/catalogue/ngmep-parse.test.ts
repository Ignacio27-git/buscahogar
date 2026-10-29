// ROADMAP 1.13 (diseño DD-3, R7) + adaptación al fichero real (continuación
// 1.13) — R7 ya está resuelto: `NGMEP_FIELD_MAP` lleva ahora la cabecera
// REAL de `docs/BD_Municipios-Entidades/MUNICIPIOS.csv`, verificada contra
// el fichero en mano (ver ngmep-parse.ts). El fixture reproduce esa forma
// real: mismas seis columnas, `;`, Latin-1, coma decimal, CRLF — nunca el
// propio fichero de 8132 filas (evitar tocar la cuota/el tamaño del
// repositorio con un fixture de test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  MalformedNgmepRowError,
  MissingNgmepColumnError,
  NGMEP_FIELD_MAP,
  parseNgmepCsv,
} from '../../src/catalogue/ngmep-parse.js';
import { MalformedDecimalError } from '../../src/catalogue/numeric.js';
import type { NgmepFieldMap } from '../../src/catalogue/ngmep-parse.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/ngmep-sample.csv', import.meta.url));
// 'latin1', igual que la capa IO real (scripts/import-municipality-catalogue.ts)
// — el fixture está guardado en bytes ISO-8859-1 de verdad, no UTF-8.
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, 'latin1');

describe('parseNgmepCsv (DD-3, R7 resuelto) — cabecera real de MUNICIPIOS.csv vía NGMEP_FIELD_MAP', () => {
  it('parsea Granada con el mapa REAL (NGMEP_FIELD_MAP ya no es un placeholder)', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP);

    expect(rows).toHaveLength(3);
    const granada = rows.find((row) => row.entityCode === '18087000000');
    expect(granada).toBeDefined();
    expect(granada?.name).toBe('Granada');
    expect(granada?.provinceCode).toBe('18');
    expect(granada?.superficieHectares).toBeCloseTo(8806.81, 2);
    expect(granada?.latitude).toBeCloseTo(37.17428891, 6);
    expect(granada?.longitude).toBeCloseTo(-3.598691013, 6);
  });

  it('EL DETALLE CRÍTICO: conserva el valor COMPLETO de la coma decimal, nunca lo trunca a la parte entera', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP);
    const alegria = rows.find((row) => row.entityCode === '01001000000');

    expect(alegria?.longitude).toBeCloseTo(-2.512507724, 9);
    expect(alegria?.longitude).not.toBe(-2); // el bug que parseFloat('-2,512507724') produciría
    expect(alegria?.latitude).toBeCloseTo(42.84045247, 8);
  });

  it('LATIN-1: un nombre con tilde y con eñe sobrevive decodificado correctamente, nunca mojibake', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP);

    expect(rows.find((row) => row.entityCode === '01001000000')?.name).toBe('Alegría-Dulantzi');
    expect(rows.find((row) => row.entityCode === '01006000000')?.name).toBe('Armiñón');
  });

  it('R7: una columna mapeada ausente del fichero real falla RUIDOSO, nombrando la fila de cabecera vista', () => {
    const brokenMap: NgmepFieldMap = { ...NGMEP_FIELD_MAP, entityCode: 'COLUMNA_QUE_NO_EXISTE' };

    expect(() => parseNgmepCsv(FIXTURE_CSV, ';', brokenMap)).toThrow(MissingNgmepColumnError);
    try {
      parseNgmepCsv(FIXTURE_CSV, ';', brokenMap);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingNgmepColumnError);
      expect((error as Error).message).toContain('COLUMNA_QUE_NO_EXISTE');
      expect((error as Error).message).toContain('COD_INE'); // la cabecera vista de verdad
    }
  });

  it('una coordenada o superficie corrupta (más de un separador decimal) falla ruidoso vía parseCommaDecimal, nunca produce NaN en silencio', () => {
    const corruptCsv =
      'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n' +
      '18087000000;18;Granada;232462;8806,81;-3,5,9;37,17428891\r\n';

    expect(() => parseNgmepCsv(corruptCsv, ';', NGMEP_FIELD_MAP)).toThrow(MalformedDecimalError);
  });

  it('ignora líneas en blanco al final del fichero', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV + '\r\n\r\n', ';', NGMEP_FIELD_MAP);
    expect(rows.every((row) => row.entityCode.length > 0)).toBe(true);
  });
});

// ROADMAP 1.15 (paso 3, PR3) — spec #261, capability runtime-config-validation:
// "The Importer's CLI Arguments And CSV Rows Are Zod-Validated, Never
// Hand-Parsed". La fila deja de construirse a mano: pasa por un esquema Zod
// (ngmepRowSchema) que exige texto no vacío en las tres columnas de texto y
// delega los tres campos numéricos a parseCommaDecimal dentro de un
// `.transform()` (nunca `z.coerce.number()` — la trampa de la coma decimal
// documentada en AI-NOTES). Wrong-type/shape ≠ decimal corrupto: este bloque
// cubre el caso NUEVO (texto vacío); el caso de decimal corrupto ya estaba
// cubierto arriba y sigue lanzando MalformedDecimalError sin envolver.
describe('parseNgmepCsv (paso 3, PR3) — fila con forma inválida aborta TODA la importación, nombrando la fila', () => {
  it('una fila con NOMBRE_ACTUAL vacío aborta, nombrando el COD_INE de la fila — nunca se descarta en silencio', () => {
    const csvWithEmptyName =
      'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n' +
      '18087000000;18;;232462;8806,81;-3,598691013;37,17428891\r\n';

    expect(() => parseNgmepCsv(csvWithEmptyName, ';', NGMEP_FIELD_MAP)).toThrow(MalformedNgmepRowError);
    try {
      parseNgmepCsv(csvWithEmptyName, ';', NGMEP_FIELD_MAP);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedNgmepRowError);
      expect((error as Error).message).toContain('18087000000');
    }
  });

  it('una fila con COD_INE vacío aborta, nombrando el número de fila', () => {
    const csvWithEmptyCode =
      'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n' +
      ';18;Granada;232462;8806,81;-3,598691013;37,17428891\r\n';

    expect(() => parseNgmepCsv(csvWithEmptyCode, ';', NGMEP_FIELD_MAP)).toThrow(MalformedNgmepRowError);
    expect(() => parseNgmepCsv(csvWithEmptyCode, ';', NGMEP_FIELD_MAP)).toThrow(/n.\s*2\b/);
  });

  it('un decimal corrupto sigue lanzando MalformedDecimalError sin envolver (comportamiento preexistente intacto)', () => {
    const corruptCsv =
      'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n' +
      '18087000000;18;Granada;232462;8806,81;-3,5,9;37,17428891\r\n';

    expect(() => parseNgmepCsv(corruptCsv, ';', NGMEP_FIELD_MAP)).toThrow(MalformedDecimalError);
  });

  it('una fila válida (con coma decimal) sigue produciendo un NgmepRow correcto tras el paso por el esquema Zod', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP);
    const granada = rows.find((row) => row.entityCode === '18087000000');
    expect(granada?.superficieHectares).toBeCloseTo(8806.81, 2);
  });
});

// ROADMAP 3.3 (decisión 249, diseño D14) — población municipal. Una celda
// con formato inesperado es "desconocida" (null), nunca 0 ni un fallo: la
// población solo ordena el top-N de la prebúsqueda, y un dato dudoso no debe
// tumbar las 8132 filas. Los únicos fallos ruidosos son la cabecera ausente
// y la guarda de deriva del importador.
const POPULATION_HEADER =
  'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n';

function csvWithPopulation(...populationCells: readonly string[]): string {
  const rows = populationCells.map(
    (cell, index) => `1808${String(index)}000000;18;Municipio ${String(index)};${cell};8806,81;-3,598691013;37,17428891\r\n`
  );
  return POPULATION_HEADER + rows.join('');
}

describe('parseNgmepCsv (3.3, decisión 249) — POBLACION_MUNI', () => {
  it('S1.1: parsea 232462 como entero 232462 (fixture real de Granada)', () => {
    const rows = parseNgmepCsv(FIXTURE_CSV, ';', NGMEP_FIELD_MAP);

    expect(rows.find((row) => row.entityCode === '18087000000')?.population).toBe(232462);
    expect(rows.find((row) => row.entityCode === '01001000000')?.population).toBe(2961);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['cero (dato ausente, nunca población real)', '0'],
    ['decimal con punto', '1.234'],
    ['signo positivo', '+5'],
    ['signo negativo', '-5'],
    ['separador de miles con coma', '1,234'],
    ['texto', 'n/d'],
    ['por encima de 2^31-1', '2147483648'],
  ])('S1.2: una celda %s es población desconocida (null) y el parseo no falla', (_label, cell) => {
    const rows = parseNgmepCsv(csvWithPopulation(cell), ';', NGMEP_FIELD_MAP);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.population).toBeNull();
  });

  it('S1.2: la frontera 2^31-1 se acepta; una celda inválida no afecta a las demás filas', () => {
    const rows = parseNgmepCsv(csvWithPopulation('2147483647', 'n/d', '232462'), ';', NGMEP_FIELD_MAP);

    expect(rows.map((row) => row.population)).toEqual([2147483647, null, 232462]);
    expect(rows.map((row) => row.name)).toEqual(['Municipio 0', 'Municipio 1', 'Municipio 2']);
  });

  it('una cabecera sin POBLACION_MUNI falla ruidoso con MissingNgmepColumnError nombrando la columna', () => {
    const withoutPopulation =
      'COD_INE;COD_PROV;NOMBRE_ACTUAL;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\r\n' +
      '18087000000;18;Granada;8806,81;-3,598691013;37,17428891\r\n';

    expect(() => parseNgmepCsv(withoutPopulation, ';', NGMEP_FIELD_MAP)).toThrow(MissingNgmepColumnError);
    expect(() => parseNgmepCsv(withoutPopulation, ';', NGMEP_FIELD_MAP)).toThrow(/POBLACION_MUNI/);
  });
});

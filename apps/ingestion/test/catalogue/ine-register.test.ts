// ROADMAP 1.13 (diseño DD-3) — decodifica el registro de municipios del INE
// (código, nombre, provincia, comunidad autónoma), mismo patrón de
// contrato de cabecera declarado que `ngmep-parse.ts` (R7): ningún nombre de
// columna literal en la lógica, resuelto vía `INE_REGISTER_FIELD_MAP`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  INE_REGISTER_FIELD_MAP,
  MissingIneRegisterColumnError,
  parseIneRegisterCsv,
} from '../../src/catalogue/ine-register.js';
import type { IneRegisterFieldMap } from '../../src/catalogue/ine-register.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/ine-register-sample.csv', import.meta.url));
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, 'utf8');

const FIXTURE_FIELD_MAP: IneRegisterFieldMap = {
  ineCode: 'CODIGO_MUNICIPIO',
  municipality: 'NOMBRE_MUNICIPIO',
  provinceCode: 'CODIGO_PROVINCIA',
  province: 'NOMBRE_PROVINCIA',
  autonomousCommunity: 'COMUNIDAD_AUTONOMA',
};

describe('parseIneRegisterCsv (DD-3) — resuelve la cabecera vía INE_REGISTER_FIELD_MAP', () => {
  it('parsea cada fila del registro con el mapa real de columnas', () => {
    const rows = parseIneRegisterCsv(FIXTURE_CSV, ';', FIXTURE_FIELD_MAP);

    const granada = rows.find((row) => row.municipality === 'Granada');
    expect(granada).toEqual({
      ineCode: '18087',
      municipality: 'Granada',
      provinceCode: '18',
      province: 'Granada',
      autonomousCommunity: 'Andalucia',
    });
  });

  it('conserva el código INE tal cual aparece en el fichero, incluido uno malformado de 6 dígitos (la validación de anchura es responsabilidad de join.ts, no de este parser)', () => {
    const rows = parseIneRegisterCsv(FIXTURE_CSV, ';', FIXTURE_FIELD_MAP);
    const malformed = rows.find((row) => row.municipality === 'Municipio Codigo Malformado');
    expect(malformed?.ineCode).toBe('180870');
  });

  it('una columna mapeada ausente falla ruidoso, nombrando la cabecera vista', () => {
    const brokenMap: IneRegisterFieldMap = { ...FIXTURE_FIELD_MAP, municipality: 'NO_EXISTE' };
    expect(() => parseIneRegisterCsv(FIXTURE_CSV, ';', brokenMap)).toThrow(MissingIneRegisterColumnError);
  });

  it('el mapa por defecto (sin rellenar) no coincide con ningún fichero real', () => {
    expect(() => parseIneRegisterCsv(FIXTURE_CSV, ';', INE_REGISTER_FIELD_MAP)).toThrow(
      MissingIneRegisterColumnError
    );
  });
});

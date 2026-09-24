// Adaptación al NGMEP real (paso 1.13 continuado) — `PROVINCIAS.csv`
// (docs/BD_Municipios-Entidades/PROVINCIAS.csv) es el único fichero real que
// trae `COMUNIDAD_AUTONOMA`: `MUNICIPIOS.csv` no la lleva. También es la
// tabla maestra de códigos de provincia válidos que activa la mitad de la
// puerta de cordura que llevaba inerte desde que se escribió (join.ts,
// sanity.ts): antes no existía ninguna tabla de provincias contra la que
// comprobar `COD_PROV`. Mismo patrón de cabecera declarada que
// ngmep-parse.ts/ine-register.ts — ningún nombre de columna literal en la
// lógica, resuelto vía `PROVINCIAS_FIELD_MAP`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  MissingProvinciaColumnError,
  PROVINCIAS_FIELD_MAP,
  parseProvinciasCsv,
} from '../../src/catalogue/provincias-parse.js';
import type { ProvinciasFieldMap } from '../../src/catalogue/provincias-parse.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/provincias-sample.csv', import.meta.url));
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, 'latin1');

describe('parseProvinciasCsv — cabecera real de PROVINCIAS.csv vía PROVINCIAS_FIELD_MAP', () => {
  it('parsea cada provincia con el mapa real de columnas, incluida la comunidad autónoma', () => {
    const rows = parseProvinciasCsv(FIXTURE_CSV, ';', PROVINCIAS_FIELD_MAP);

    expect(rows).toHaveLength(3);
    const granada = rows.find((row) => row.provinceCode === '18');
    expect(granada).toEqual({ provinceCode: '18', province: 'Granada', autonomousCommunity: 'Andalucía' });
  });

  it('LATIN-1: nombres con tilde y con eñe (vía Ñ) sobreviven decodificados, nunca mojibake', () => {
    const rows = parseProvinciasCsv(FIXTURE_CSV, ';', PROVINCIAS_FIELD_MAP);
    const alava = rows.find((row) => row.provinceCode === '01');
    expect(alava?.province).toBe('Araba/Álava');
    expect(alava?.autonomousCommunity).toBe('País Vasco/Euskadi');
  });

  it('una columna mapeada ausente falla ruidoso, nombrando la cabecera vista', () => {
    const brokenMap: ProvinciasFieldMap = { ...PROVINCIAS_FIELD_MAP, province: 'NO_EXISTE' };
    expect(() => parseProvinciasCsv(FIXTURE_CSV, ';', brokenMap)).toThrow(MissingProvinciaColumnError);
  });
});

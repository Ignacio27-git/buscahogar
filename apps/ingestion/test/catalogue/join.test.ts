// ROADMAP 1.13 (diseño DD-4, DD-8, Q2) + adaptación al fichero real
// (continuación 1.13) — el diseño original resolvía, con tres niveles
// deterministas (tier 1/2/3), CUÁL fila de ENTIDADES.csv (~150k filas, con
// varias "entidades" por municipio) representaba cada municipio del
// registro INE. `MUNICIPIOS.csv` YA es una fila por municipio (8132 filas,
// una por cada uno): no hay nada que desambiguar, así que la lógica ES/NUC
// de tiers se elimina entera, no solo se deja inerte — mantenerla habría
// sido código muerto que nunca podría ejecutarse contra el fichero real
// (nunca hay hermanas que comparar). Lo que sustituye al join por prefijo
// de 5 dígitos es más simple: derivar el código de municipio de los 5
// primeros caracteres de `COD_INE` (11 dígitos) y resolver su provincia
// (nombre + comunidad autónoma, que `MUNICIPIOS.csv` no lleva) contra
// `PROVINCIAS.csv`.
import { describe, expect, it } from 'vitest';

import { joinCatalogue, MalformedMunicipalityCodeError, UnknownProvinceCodeError } from '../../src/catalogue/join.js';
import type { NgmepRow } from '../../src/catalogue/ngmep-parse.js';
import type { ProvinciaRow } from '../../src/catalogue/provincias-parse.js';

function municipio(overrides: Partial<NgmepRow> = {}): NgmepRow {
  return {
    entityCode: '18087000000',
    name: 'Granada',
    provinceCode: '18',
    population: 232462,
    superficieHectares: 8806.81,
    latitude: 37.17428891,
    longitude: -3.598691013,
    ...overrides,
  };
}

function provincia(overrides: Partial<ProvinciaRow> = {}): ProvinciaRow {
  return { provinceCode: '18', province: 'Granada', autonomousCommunity: 'Andalucía', ...overrides };
}

describe('joinCatalogue (adaptación real) — deriva el código de municipio y resuelve su provincia, sin niveles que desambiguar', () => {
  it('deriva el código de 5 dígitos de los 5 primeros caracteres de COD_INE (11 dígitos)', () => {
    const result = joinCatalogue([municipio()], [provincia()]);

    expect(result).toHaveLength(1);
    expect(result[0]?.ineCode).toBe('18087');
  });

  it('resuelve nombre de provincia y comunidad autónoma desde PROVINCIAS.csv (MUNICIPIOS.csv no las lleva)', () => {
    const result = joinCatalogue([municipio()], [provincia()]);

    expect(result[0]?.province).toBe('Granada');
    expect(result[0]?.autonomousCommunity).toBe('Andalucía');
    expect(result[0]?.provinceCode).toBe('18');
  });

  it('conserva el centroide, la superficie, y el searchName plegado (DD-22)', () => {
    const result = joinCatalogue([municipio()], [provincia()]);

    expect(result[0]?.centroidCandidate).toEqual({ latitude: 37.17428891, longitude: -3.598691013 });
    expect(result[0]?.superficieHectares).toBeCloseTo(8806.81, 2);
    expect(result[0]?.searchName).toBe('granada');
  });

  it('3.3: arrastra la población del NgmepRow, y conserva null (desconocida) sin convertirla en 0', () => {
    const result = joinCatalogue([municipio(), municipio({ entityCode: '18088000000', population: null })], [provincia()]);

    expect(result.map((row) => row.population)).toEqual([232462, null]);
  });

  it('expone declaredProvinceCode (COD_PROV de la fila) y expectedProvinceCode (prefijo del código derivado) para la puerta de cordura', () => {
    const result = joinCatalogue([municipio()], [provincia()]);

    expect(result[0]?.declaredProvinceCode).toBe('18');
    expect(result[0]?.expectedProvinceCode).toBe('18');
  });

  it('un COD_INE cuyos 5 primeros caracteres no son 5 dígitos aborta explícito, nombrando el COD_INE ofensivo — nunca se trunca en silencio', () => {
    expect(() => joinCatalogue([municipio({ entityCode: '1808X000000' })], [provincia()])).toThrow(
      MalformedMunicipalityCodeError
    );
    try {
      joinCatalogue([municipio({ entityCode: '1808X000000' })], [provincia()]);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('1808X000000');
    }
  });

  it('un COD_PROV que no existe en PROVINCIAS.csv aborta explícito, nombrando el código ofensivo — nunca se fabrica una comunidad autónoma', () => {
    expect(() => joinCatalogue([municipio({ provinceCode: '99' })], [provincia()])).toThrow(UnknownProvinceCodeError);
    try {
      joinCatalogue([municipio({ provinceCode: '99' })], [provincia()]);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('99');
    }
  });

  it('cada fila de MUNICIPIOS.csv produce exactamente una fila de salida — 1:1, nunca se filtra ni se colapsa (MUNICIPIOS.csv ya es agregado)', () => {
    const result = joinCatalogue(
      [municipio({ entityCode: '18087000000' }), municipio({ entityCode: '29067000000', provinceCode: '29', name: 'Málaga' })],
      [provincia({ provinceCode: '18' }), provincia({ provinceCode: '29', province: 'Málaga', autonomousCommunity: 'Andalucía' })]
    );

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.ineCode)).toEqual(['18087', '29067']);
  });
});

// ROADMAP 1.13 (diseño DD-4, DD-8, Q2) + adaptación al fichero real
// (continuación 1.13) — el diseño original resolvía, con tres niveles
// deterministas (tier 1/2/3, "ES/NUC"), CUÁL fila de ENTIDADES.csv (~150k
// filas, con varias "entidades" por municipio) representaba cada municipio
// del registro INE. Esa lógica se ELIMINA aquí, no se deja inerte:
// `docs/BD_Municipios-Entidades/MUNICIPIOS.csv` YA es una fila por
// municipio (8132 filas, una por cada uno) — no hay ninguna entidad
// hermana que desambiguar contra la que resolver un nivel. Mantener el
// código de tiers habría sido código muerto: ninguna rama tier-2/tier-3
// podría ejecutarse jamás contra el fichero real.
//
// Lo que sustituye al join por prefijo de 5 dígitos es más simple y con la
// misma disciplina de "nunca fabricar, nunca truncar en silencio":
//   1. derivar el código de municipio (5 dígitos) de los 5 primeros
//      caracteres de `COD_INE` (11 dígitos) — abortando, nombrando el
//      `COD_INE` ofensivo, si el resultado no son 5 dígitos (mismo
//      principio que el guarda de anti-truncamiento original, DD-8);
//   2. resolver la provincia (nombre + comunidad autónoma, que
//      `MUNICIPIOS.csv` no lleva) contra `PROVINCIAS.csv` por `COD_PROV` —
//      abortando, nombrando el código ofensivo, si no existe en la tabla
//      maestra (nunca se fabrica una comunidad autónoma para un código
//      desconocido).
import { normalizeSearchName } from '@buscahogar/core';
import type { Coordinates } from '@buscahogar/core';

import type { NgmepRow } from './ngmep-parse.js';
import type { ProvinciaRow } from './provincias-parse.js';

export interface JoinedMunicipality {
  readonly ineCode: string; // siempre 5 dígitos, derivado y validado
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
  readonly searchName: string;
  readonly centroidCandidate: Coordinates;
  readonly superficieHectares: number;
  // Población municipal (3.3); `null` = desconocida.
  readonly population: number | null;
  // Para la puerta de cordura (sanity.ts): COD_PROV tal como lo declara la
  // propia fila frente al prefijo de 2 dígitos del código ya derivado.
  readonly declaredProvinceCode: string;
  readonly expectedProvinceCode: string;
}

export class MalformedMunicipalityCodeError extends Error {
  constructor(rawCodIne: string) {
    super(
      `COD_INE "${rawCodIne}" no produce un código de municipio de 5 dígitos válido en sus 5 ` +
        `primeros caracteres — nunca se trunca ni se acepta en silencio.`
    );
  }
}

export class UnknownProvinceCodeError extends Error {
  constructor(rawProvinceCode: string) {
    super(
      `COD_PROV "${rawProvinceCode}" no existe en PROVINCIAS.csv — nunca se fabrica una ` +
        `comunidad autónoma para un código de provincia desconocido.`
    );
  }
}

const FIVE_DIGITS = /^\d{5}$/;

function deriveMunicipalityCode(rawCodIne: string): string {
  const code = rawCodIne.slice(0, 5);
  if (!FIVE_DIGITS.test(code)) {
    throw new MalformedMunicipalityCodeError(rawCodIne);
  }
  return code;
}

export function joinCatalogue(
  municipioRows: readonly NgmepRow[],
  provinciaRows: readonly ProvinciaRow[]
): readonly JoinedMunicipality[] {
  const provinciaByCode = new Map(provinciaRows.map((row) => [row.provinceCode, row]));

  return municipioRows.map((row): JoinedMunicipality => {
    const ineCode = deriveMunicipalityCode(row.entityCode);
    const provincia = provinciaByCode.get(row.provinceCode);
    if (!provincia) {
      throw new UnknownProvinceCodeError(row.provinceCode);
    }

    return {
      ineCode,
      municipality: row.name,
      province: provincia.province,
      provinceCode: row.provinceCode,
      autonomousCommunity: provincia.autonomousCommunity,
      searchName: normalizeSearchName(row.name),
      centroidCandidate: { latitude: row.latitude, longitude: row.longitude },
      superficieHectares: row.superficieHectares,
      population: row.population,
      declaredProvinceCode: row.provinceCode,
      expectedProvinceCode: ineCode.slice(0, 2),
    };
  });
}

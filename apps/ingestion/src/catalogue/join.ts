// ROADMAP 1.13 (diseño DD-4, DD-8, Q2) — une el registro INE con las
// entidades NGMEP por el prefijo de 5 dígitos, PURO, sin IO. Tres niveles
// deterministas, en orden de preferencia:
//   TIER 1 — la entidad cuyo sufijo de 6 dígitos es "000000" (la fila
//     municipal propiamente dicha). Único por construcción si existe.
//   TIER 2 — entre las hermanas, la que normaliza al mismo nombre que el
//     municipio del registro INE (`normalizeSearchName`, DD-22 — comparte
//     implementación con la web para no divergir nunca).
//   TIER 3 — el código de entidad MÁS BAJO entre las hermanas: un orden
//     total sobre strings, así que siempre es reproducible, nunca
//     arbitrario.
// "Exactamente una fila representante por municipio" (obs #209 §Q3) NO se
// asume: el nivel que resolvió cada municipio se reporta en `tier`, lo que
// convierte la suposición en una medición (import-report.ts la cuenta).
//
// DD-8, Q6 — la anchura del `ine_code` NUNCA se trunca en silencio: un
// código de 6 dígitos aborta el join entero, nombrando el código ofensivo,
// salvo que el operador pase `--ine-code-width=6` de forma explícita, en
// cuyo caso se truncan los 5 primeros dígitos y el recuento de filas
// truncadas se registra (para la cabecera de procedencia, DD-6). No se
// inventa ningún algoritmo de dígito de control — la bandera del operador
// ES la decisión registrada.
import { normalizeSearchName } from '@buscahogar/core';
import type { Coordinates } from '@buscahogar/core';

import type { IneRegisterRow } from './ine-register.js';
import type { NgmepRow } from './ngmep-parse.js';

export type MunicipalityTier = 'tier-1' | 'tier-2' | 'tier-3' | 'unmatched';

export interface JoinedMunicipality {
  readonly ineCode: string; // siempre 5 dígitos tras el join (truncado o ya correcto)
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
  readonly searchName: string;
  readonly tier: MunicipalityTier;
  readonly centroidCandidate: Coordinates | null;
  // Todas las entidades NGMEP que comparten el prefijo de 5 dígitos,
  // incluida la elegida como centroide candidato — geo.ts (DD-9) y
  // sanity.ts (guarda de esparcimiento, DD-4) las necesitan tal cual.
  readonly siblingCoordinates: readonly Coordinates[];
}

export interface JoinOptions {
  readonly ineCodeWidth?: 5 | 6;
}

export interface JoinResult {
  readonly municipalities: readonly JoinedMunicipality[];
  readonly truncatedCount: number;
}

export class MalformedIneCodeError extends Error {
  constructor(offendingIneCode: string) {
    super(
      `ine_code "${offendingIneCode}" no tiene 5 dígitos. Si el fichero real usa códigos de 6 ` +
        `dígitos, vuelve a ejecutar con --ine-code-width=6 para truncar explícitamente (DD-8) — ` +
        `nunca se trunca en silencio.`
    );
  }
}

const FIVE_DIGITS = /^\d{5}$/;
const SIX_DIGITS = /^\d{6}$/;

function resolveIneCode(rawIneCode: string, ineCodeWidth: 5 | 6): { readonly code: string; readonly truncated: boolean } {
  if (FIVE_DIGITS.test(rawIneCode)) {
    return { code: rawIneCode, truncated: false };
  }
  if (ineCodeWidth === 6 && SIX_DIGITS.test(rawIneCode)) {
    return { code: rawIneCode.slice(0, 5), truncated: true };
  }
  throw new MalformedIneCodeError(rawIneCode);
}

export function joinCatalogue(
  ineRows: readonly IneRegisterRow[],
  ngmepRows: readonly NgmepRow[],
  options: JoinOptions = {}
): JoinResult {
  const ineCodeWidth = options.ineCodeWidth ?? 5;
  let truncatedCount = 0;

  const municipalities = ineRows.map((ineRow): JoinedMunicipality => {
    const { code, truncated } = resolveIneCode(ineRow.ineCode, ineCodeWidth);
    if (truncated) {
      truncatedCount += 1;
    }

    const siblings = ngmepRows.filter((row) => row.entityCode.slice(0, 5) === code);
    const siblingCoordinates: Coordinates[] = siblings.map((row) => ({
      latitude: row.latitude,
      longitude: row.longitude,
    }));

    const tier1 = siblings.find((row) => row.entityCode.slice(5) === '000000');
    if (tier1) {
      return {
        ineCode: code,
        municipality: ineRow.municipality,
        province: ineRow.province,
        provinceCode: ineRow.provinceCode,
        autonomousCommunity: ineRow.autonomousCommunity,
        searchName: normalizeSearchName(ineRow.municipality),
        tier: 'tier-1',
        centroidCandidate: { latitude: tier1.latitude, longitude: tier1.longitude },
        siblingCoordinates,
      };
    }

    const normalizedMunicipality = normalizeSearchName(ineRow.municipality);
    const nameMatch = siblings.find((row) => normalizeSearchName(row.name) === normalizedMunicipality);
    if (nameMatch) {
      return {
        ineCode: code,
        municipality: ineRow.municipality,
        province: ineRow.province,
        provinceCode: ineRow.provinceCode,
        autonomousCommunity: ineRow.autonomousCommunity,
        searchName: normalizedMunicipality,
        tier: 'tier-2',
        centroidCandidate: { latitude: nameMatch.latitude, longitude: nameMatch.longitude },
        siblingCoordinates,
      };
    }

    if (siblings.length > 0) {
      const lowestCode = siblings.reduce((lowest, row) => (row.entityCode < lowest.entityCode ? row : lowest));
      return {
        ineCode: code,
        municipality: ineRow.municipality,
        province: ineRow.province,
        provinceCode: ineRow.provinceCode,
        autonomousCommunity: ineRow.autonomousCommunity,
        searchName: normalizedMunicipality,
        tier: 'tier-3',
        centroidCandidate: { latitude: lowestCode.latitude, longitude: lowestCode.longitude },
        siblingCoordinates,
      };
    }

    return {
      ineCode: code,
      municipality: ineRow.municipality,
      province: ineRow.province,
      provinceCode: ineRow.provinceCode,
      autonomousCommunity: ineRow.autonomousCommunity,
      searchName: normalizedMunicipality,
      tier: 'unmatched',
      centroidCandidate: null,
      siblingCoordinates: [],
    };
  });

  return { municipalities, truncatedCount };
}

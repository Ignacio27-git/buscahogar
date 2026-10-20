// Paso 1.7 — catálogo de municipios a sembrar (diseño D8, decisión de
// producto P5). Módulo PURO: sin IO, sin `process.env`, testeable offline
// (`test/seed-data.test.ts`). `seed.ts` es el único llamador.
//
// Fabricar un código INE está prohibido (P5, COVERAGE-8): cada entrada exige
// su propia cita de la fuente del dato. Un municipio cuyo código real no se
// conoce y verifica simplemente NO tiene entrada aquí — nunca un valor
// inventado ni un placeholder. La validación estructural (más abajo) no
// puede demostrar que un código es correcto, solo que no es obviamente
// inválido; por eso la cita de la fuente es obligatoria y no opcional.
//
// Sin Zod (decisión 023: `packages/db` no usa Zod) — comprobaciones escritas
// a mano.
import { normalizeSearchName } from '@buscahogar/core';

// ROADMAP 1.13 (diseño DD-1/DD-2) — `centroid`/`sweepRadiusM` opcionales:
// nulos hasta que el catálogo importado (fase de conversión offline,
// `apps/ingestion/scripts/import-municipality-catalogue.ts`) aporta una
// coordenada que pasa la puerta de cordura. `searchName` es obligatorio:
// toda entrada, incluida esta catalogación manual, necesita el nombre
// plegado que consume el autocompletado (DD-22).
export interface MunicipalitySeed {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
  readonly centroid?: { readonly latitude: number; readonly longitude: number };
  readonly sweepRadiusM?: number;
  readonly searchName: string;
  // ROADMAP 3.3 (decisión 249): población municipal del NGMEP. Ausente =
  // desconocida (NULL en base de datos), nunca 0.
  readonly population?: number;
  // Cita de dónde sale el código INE — la evidencia de que no se ha
  // fabricado, no un campo decorativo.
  readonly source: string;
}

export class InvalidMunicipalitySeedError extends Error {
  readonly entry: MunicipalitySeed;

  constructor(entry: MunicipalitySeed, reason: string) {
    super(`Entrada de municipio inválida para "${entry.municipality}" (ine_code="${entry.ineCode}"): ${reason}`);
    this.entry = entry;
  }
}

// Granada, código de municipio 18087 (provincia de Granada, código de
// provincia 18) — dato real del Instituto Nacional de Estadística (Registro
// de Entidades Locales / Callejero de municipios), suministrado y confirmado
// explícitamente por el responsable del proyecto para esta siembra. No es un
// valor recordado sin verificar: es el único municipio que ROADMAP 1.7 pide
// barrer, y su código llega por esta vía en vez de inventarse (P5).
export const MUNICIPALITY_CATALOGUE: readonly MunicipalitySeed[] = [
  {
    ineCode: '18087',
    municipality: 'Granada',
    province: 'Granada',
    provinceCode: '18',
    autonomousCommunity: 'Andalucía',
    searchName: normalizeSearchName('Granada'),
    source:
      'INE — Registro de Entidades Locales / Callejero, código de municipio 18087, confirmado por el responsable del proyecto (ROADMAP 1.7).',
  },
];

const INE_CODE_PATTERN = /^\d{5}$/;
const PROVINCE_CODE_PATTERN = /^\d{2}$/;

// Comprobación estructural, no de veracidad (D8): solo INE puede confirmar
// que un código es correcto. Esto solo puede demostrar que uno es
// claramente inválido (longitud, o una provincia que no coincide) — de ahí
// que la cita de la fuente en `MunicipalitySeed.source` sea obligatoria y no
// esta función.
export function assertValidMunicipality(entry: MunicipalitySeed): void {
  if (!INE_CODE_PATTERN.test(entry.ineCode)) {
    throw new InvalidMunicipalitySeedError(entry, 'ine_code debe tener exactamente 5 dígitos.');
  }
  if (!PROVINCE_CODE_PATTERN.test(entry.provinceCode)) {
    throw new InvalidMunicipalitySeedError(entry, 'province_code debe tener exactamente 2 dígitos.');
  }
  if (!entry.ineCode.startsWith(entry.provinceCode)) {
    throw new InvalidMunicipalitySeedError(
      entry,
      `ine_code "${entry.ineCode}" no empieza por su province_code "${entry.provinceCode}".`
    );
  }
  if (entry.source.trim().length === 0) {
    throw new InvalidMunicipalitySeedError(entry, 'falta la cita de la fuente del código INE — nunca se fabrica (P5).');
  }
}

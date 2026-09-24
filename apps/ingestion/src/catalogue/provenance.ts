// ROADMAP 1.13 (diseño DD-6, A-3) — cabecera de procedencia del catálogo
// importado, PURA, sin IO. Es la evidencia de que ningún dato del catálogo
// se ha fabricado (P5, CLAUDE.md): de dónde salió, cuándo se descargó, con
// qué checksum, y qué resultado tuvo el import (cuántas filas por tier,
// cuántas se quedaron sin centroide y por qué). También es la vía por la
// que la atribución CC-BY/IGN (Orden FOM/2807/2015, obligación legal, A-3)
// llega al propio artefacto committeado, no solo a la interfaz web.
export interface ProvenanceInput {
  readonly sourceUrls: readonly string[];
  readonly downloadDate: string; // suministrada por el operador, nunca inferida
  readonly sourceFileNames: readonly string[];
  readonly sourceSha256: readonly string[];
  // DD-7: el sistema de referencia verbatim tal como lo declara el propio
  // fichero — nunca asumido, nunca reproyectado.
  readonly sourceCrsString: string;
  readonly delimiter: string;
  readonly encoding: string;
  readonly inputRowCount: number;
  readonly emittedRowCount: number;
  readonly centroidCount: number;
  readonly centroidlessCount: number;
  readonly tier1Count: number;
  readonly tier2Count: number;
  readonly tier3Count: number;
  readonly unmatchedCount: number;
  readonly spreadGuardDrops: number;
  readonly sanityGateDrops: number;
  readonly radiusFloorM: number;
  readonly radiusCeilingM: number;
  readonly importerVersion: string;
}

export interface ProvenanceHeader extends ProvenanceInput {
  readonly attribution: string;
}

export const ATTRIBUTION_TEXT =
  'Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de ' +
  'Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información ' +
  'Geográfica (CNIG), bajo licencia CC-BY 4.0 (Orden FOM/2807/2015).';

export class MissingProvenanceFieldError extends Error {
  constructor(field: string) {
    super(
      `Falta "${field}" en la cabecera de procedencia del catálogo — un artefacto sin ` +
        `procedencia demostrable no se emite (P5, COVERAGE-8).`
    );
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new MissingProvenanceFieldError(field);
  }
}

function assertNonEmptyList(value: readonly unknown[], field: string): void {
  if (value.length === 0) {
    throw new MissingProvenanceFieldError(field);
  }
}

export function buildProvenanceHeader(input: ProvenanceInput): ProvenanceHeader {
  assertNonEmptyList(input.sourceUrls, 'sourceUrls');
  assertNonEmptyString(input.downloadDate, 'downloadDate');
  assertNonEmptyList(input.sourceFileNames, 'sourceFileNames');
  assertNonEmptyList(input.sourceSha256, 'sourceSha256');
  assertNonEmptyString(input.sourceCrsString, 'sourceCrsString');
  assertNonEmptyString(input.delimiter, 'delimiter');
  assertNonEmptyString(input.encoding, 'encoding');
  assertNonEmptyString(input.importerVersion, 'importerVersion');

  return { ...input, attribution: ATTRIBUTION_TEXT };
}

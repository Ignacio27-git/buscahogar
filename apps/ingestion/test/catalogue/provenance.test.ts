// ROADMAP 1.13 (diseño DD-6, A-3) — cabecera de procedencia del catálogo
// importado: qué fichero, de dónde, cuándo, con qué checksum, y con qué
// resultado. Es la evidencia de que ningún dato se ha fabricado (P5,
// CLAUDE.md) y la vía por la que la atribución CC-BY/IGN llega al propio
// artefacto committeado (A-3).
import { describe, expect, it } from 'vitest';

import { ATTRIBUTION_TEXT, buildProvenanceHeader, MissingProvenanceFieldError } from '../../src/catalogue/provenance.js';
import type { ProvenanceInput } from '../../src/catalogue/provenance.js';

function input(overrides: Partial<ProvenanceInput> = {}): ProvenanceInput {
  return {
    sourceUrls: ['https://centrodedescargas.cnig.es/ngmep-sample'],
    downloadDate: '2026-09-20',
    sourceFileNames: ['ngmep.csv', 'ine-register.csv'],
    sourceSha256: ['abc123', 'def456'],
    sourceCrsString: 'ETRS89 / REGCAN95 (mixto, verbatim del fichero)',
    delimiter: ';',
    encoding: 'latin1',
    inputRowCount: 8,
    emittedRowCount: 4,
    centroidCount: 3,
    centroidlessCount: 1,
    tier1Count: 1,
    tier2Count: 1,
    tier3Count: 1,
    unmatchedCount: 1,
    spreadGuardDrops: 1,
    sanityGateDrops: 0,
    radiusFloorM: 2000,
    radiusCeilingM: 15000,
    importerVersion: '1.0.0',
    ...overrides,
  };
}

describe('buildProvenanceHeader (DD-6, A-3)', () => {
  it('incluye url de fuente, fecha de descarga, checksum, CRS verbatim y recuentos por tier, todos no vacíos', () => {
    const header = buildProvenanceHeader(input());

    expect(header.sourceUrls.length).toBeGreaterThan(0);
    expect(header.downloadDate.trim().length).toBeGreaterThan(0);
    expect(header.sourceSha256.length).toBeGreaterThan(0);
    expect(header.sourceCrsString.trim().length).toBeGreaterThan(0);
    expect(header.tier1Count).toBe(1);
    expect(header.tier2Count).toBe(1);
    expect(header.tier3Count).toBe(1);
  });

  it('incluye el texto de atribución CC-BY/IGN, nombrando IGN/CNIG y la licencia CC-BY (A-3)', () => {
    const header = buildProvenanceHeader(input());
    expect(header.attribution).toBe(ATTRIBUTION_TEXT);
    expect(header.attribution).toMatch(/IGN|CNIG/);
    expect(header.attribution).toMatch(/CC-BY/);
  });

  it('falla ruidoso si falta la url de fuente — nunca un artefacto sin procedencia demostrable', () => {
    expect(() => buildProvenanceHeader(input({ sourceUrls: [] }))).toThrow(MissingProvenanceFieldError);
  });

  it('falla ruidoso si falta la fecha de descarga', () => {
    expect(() => buildProvenanceHeader(input({ downloadDate: '' }))).toThrow(MissingProvenanceFieldError);
  });

  it('falla ruidoso si falta el checksum', () => {
    expect(() => buildProvenanceHeader(input({ sourceSha256: [] }))).toThrow(MissingProvenanceFieldError);
  });

  it('falla ruidoso si falta la cadena CRS verbatim (DD-7 la exige registrada, no asumida)', () => {
    expect(() => buildProvenanceHeader(input({ sourceCrsString: '' }))).toThrow(MissingProvenanceFieldError);
  });
});

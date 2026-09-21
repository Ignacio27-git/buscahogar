// ROADMAP 1.13 (diseño A-2, CR-11) — el informe de import enumera cada fila
// que se quedó sin centroide (fallo de puerta de cordura, guarda de
// esparcimiento, o sin coincidencia NGMEP), con su código INE exacto — un
// recuento ruidoso, nunca una pérdida silenciosa (P5, CLAUDE.md).
import { describe, expect, it } from 'vitest';

import { buildImportReport } from '../../src/catalogue/import-report.js';
import type { ImportReportRow } from '../../src/catalogue/import-report.js';

function row(overrides: Partial<ImportReportRow> = {}): ImportReportRow {
  return { ineCode: '18087', centroid: { latitude: 37.17, longitude: -3.6 }, ...overrides };
}

describe('buildImportReport (A-2, CR-11) — enumera cada fila sin centroide, nunca solo el recuento', () => {
  it('sobre un fixture con dos filas con centroide y dos sin él, enumera exactamente los dos códigos INE que fallaron', () => {
    const report = buildImportReport([
      row({ ineCode: '18087' }),
      row({ ineCode: '07040' }),
      row({ ineCode: '29067', centroid: null }),
      row({ ineCode: '47186', centroid: null }),
    ]);

    expect(report.totalRows).toBe(4);
    expect(report.centroidCount).toBe(2);
    expect(report.centroidlessCount).toBe(2);
    expect(report.centroidlessIneCodes).toEqual(['29067', '47186']);
  });

  it('cuando todas las filas tienen centroide, la lista de códigos sin centroide está vacía (no ausente)', () => {
    const report = buildImportReport([row({ ineCode: '18087' }), row({ ineCode: '07040' })]);

    expect(report.centroidlessCount).toBe(0);
    expect(report.centroidlessIneCodes).toEqual([]);
  });
});

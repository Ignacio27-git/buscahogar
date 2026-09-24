// ROADMAP 1.13 (diseño A-2, CR-11) — informe de import, PURO, sin IO.
// Enumera cada fila que se quedó sin centroide (fallo de puerta de cordura,
// guarda de esparcimiento, o sin ninguna entidad NGMEP hermana), con su
// código INE exacto — nunca solo un recuento agregado. Un recuento sin la
// lista de códigos sería exactamente el tipo de pérdida silenciosa que P5 y
// COVERAGE-8 prohíben: nadie podría auditar cuál municipio concreto se
// quedó sin cobertura barrible ni por qué.
import type { Coordinates } from '@buscahogar/core';

export interface ImportReportRow {
  readonly ineCode: string;
  readonly centroid: Coordinates | null;
}

export interface ImportReport {
  readonly totalRows: number;
  readonly centroidCount: number;
  readonly centroidlessCount: number;
  readonly centroidlessIneCodes: readonly string[];
}

export function buildImportReport(rows: readonly ImportReportRow[]): ImportReport {
  const centroidlessIneCodes = rows.filter((row) => row.centroid === null).map((row) => row.ineCode);

  return {
    totalRows: rows.length,
    centroidCount: rows.length - centroidlessIneCodes.length,
    centroidlessCount: centroidlessIneCodes.length,
    centroidlessIneCodes,
  };
}

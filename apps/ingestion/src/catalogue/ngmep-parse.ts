// ROADMAP 1.13 (diseño DD-3, R7) — R7 es una precondición de APLICACIÓN que
// ningún agente de este proyecto puede saltarse: nadie puede descargar el
// ZIP del NGMEP (Nomenclátor Geográfico de Municipios y Entidades de
// Población, CNIG) ni leer su fila de cabecera real. Este módulo PURO nunca
// referencia un nombre de columna literal en su lógica: resuelve la
// cabecera a través de UNA ÚNICA constante exportada, `NGMEP_FIELD_MAP`, que
// el operador rellena una sola vez desde el fichero real en mano, tras
// verificar exactamente estas cuatro cosas (nota para la tarea de apply,
// nunca asumidas aquí):
//   1. presencia/ausencia de una columna de código INE de 5 dígitos frente
//      al código de entidad completo de 11 (provincia+municipio+EC+ES+NUC);
//   2. la ortografía exacta de la cabecera;
//   3. si latitud/longitud vienen en grados decimales o en DMS;
//   4. el delimitador y la codificación — un CSV del CNIG es plausiblemente
//      `;`+Latin-1, nunca asumido `,`+UTF-8 por defecto.
//
// Los puntos 3 y 4 son responsabilidad de la capa IO
// (`scripts/import-municipality-catalogue.ts`, sin test dedicado, mismo
// precedente que `scripts/sweep-zone.ts:9-15`): decodifica el fichero con la
// codificación declarada y pasa el delimitador explícito a esta función.
// Esta función PURA recibe siempre un `string` de JavaScript ya decodificado
// y espera coordenadas en grados decimales — el punto 3 se resuelve
// verificando el fichero real antes de escribir un mapa de campos que
// asuma DMS sin comprobarlo.
export type NgmepFieldKey = 'entityCode' | 'name' | 'latitude' | 'longitude';

export type NgmepFieldMap = Readonly<Record<NgmepFieldKey, string>>;

// Valores placeholder DELIBERADAMENTE implausibles: si este mapa por
// defecto se usa contra un fichero real sin que el operador lo haya
// rellenado, DEBE fallar ruidoso (columna ausente) en vez de encontrar por
// casualidad la columna equivocada.
export const NGMEP_FIELD_MAP: NgmepFieldMap = {
  entityCode: 'REPLACE_WITH_REAL_NGMEP_HEADER__entityCode',
  name: 'REPLACE_WITH_REAL_NGMEP_HEADER__name',
  latitude: 'REPLACE_WITH_REAL_NGMEP_HEADER__latitude',
  longitude: 'REPLACE_WITH_REAL_NGMEP_HEADER__longitude',
};

export interface NgmepRow {
  readonly entityCode: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export class MissingNgmepColumnError extends Error {
  constructor(missingHeaderName: string, observedHeaderRow: readonly string[]) {
    super(
      `Falta la columna NGMEP "${missingHeaderName}" (NGMEP_FIELD_MAP) en el fichero. ` +
        `Cabecera vista: [${observedHeaderRow.join(', ')}]`
    );
  }
}

// Divisor de línea CSV mínimo: respeta campos entre comillas dobles (con
// escape `""`) que contengan el propio delimitador — suficiente para un
// fichero administrativo, sin traer una dependencia de parseo CSV completa.
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] ?? '';
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
}

export function parseNgmepCsv(
  csvText: string,
  delimiter: string,
  fieldMap: NgmepFieldMap = NGMEP_FIELD_MAP
): readonly NgmepRow[] {
  const lines = splitLines(csvText);
  if (lines.length === 0) {
    return [];
  }

  const header = splitCsvLine(lines[0] ?? '', delimiter);
  const columnIndex = {} as Record<NgmepFieldKey, number>;
  for (const [field, headerName] of Object.entries(fieldMap) as [NgmepFieldKey, string][]) {
    const index = header.indexOf(headerName);
    if (index === -1) {
      throw new MissingNgmepColumnError(headerName, header);
    }
    columnIndex[field] = index;
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    return {
      entityCode: (cells[columnIndex.entityCode] ?? '').trim(),
      name: (cells[columnIndex.name] ?? '').trim(),
      latitude: Number(cells[columnIndex.latitude]),
      longitude: Number(cells[columnIndex.longitude]),
    };
  });
}

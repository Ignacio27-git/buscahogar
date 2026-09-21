// ROADMAP 1.13 (diseño DD-3) — decodifica el registro de municipios del INE
// (Registro de Entidades Locales / Callejero), PURO, sin IO. Mismo patrón de
// contrato de cabecera declarado que `ngmep-parse.ts` (R7): ningún nombre de
// columna literal en la lógica — se resuelve vía `INE_REGISTER_FIELD_MAP`,
// que el operador rellena desde el fichero real en mano.
//
// A diferencia de `ngmep-parse.ts`, este módulo NO valida la anchura del
// `ine_code` (5 vs 6 dígitos): esa comprobación depende de una bandera de
// operador (`--ine-code-width`) y de si abortar o truncar, que es lógica de
// `join.ts` (DD-8) — este parser solo decodifica lo que el fichero dice,
// tal cual.
export type IneRegisterFieldKey = 'ineCode' | 'municipality' | 'province' | 'provinceCode' | 'autonomousCommunity';

export type IneRegisterFieldMap = Readonly<Record<IneRegisterFieldKey, string>>;

export const INE_REGISTER_FIELD_MAP: IneRegisterFieldMap = {
  ineCode: 'REPLACE_WITH_REAL_INE_HEADER__ineCode',
  municipality: 'REPLACE_WITH_REAL_INE_HEADER__municipality',
  province: 'REPLACE_WITH_REAL_INE_HEADER__province',
  provinceCode: 'REPLACE_WITH_REAL_INE_HEADER__provinceCode',
  autonomousCommunity: 'REPLACE_WITH_REAL_INE_HEADER__autonomousCommunity',
};

export interface IneRegisterRow {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
}

export class MissingIneRegisterColumnError extends Error {
  constructor(missingHeaderName: string, observedHeaderRow: readonly string[]) {
    super(
      `Falta la columna del registro INE "${missingHeaderName}" (INE_REGISTER_FIELD_MAP) en el fichero. ` +
        `Cabecera vista: [${observedHeaderRow.join(', ')}]`
    );
  }
}

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

export function parseIneRegisterCsv(
  csvText: string,
  delimiter: string,
  fieldMap: IneRegisterFieldMap = INE_REGISTER_FIELD_MAP
): readonly IneRegisterRow[] {
  const lines = splitLines(csvText);
  if (lines.length === 0) {
    return [];
  }

  const header = splitCsvLine(lines[0] ?? '', delimiter);
  const columnIndex = {} as Record<IneRegisterFieldKey, number>;
  for (const [field, headerName] of Object.entries(fieldMap) as [IneRegisterFieldKey, string][]) {
    const index = header.indexOf(headerName);
    if (index === -1) {
      throw new MissingIneRegisterColumnError(headerName, header);
    }
    columnIndex[field] = index;
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    return {
      ineCode: (cells[columnIndex.ineCode] ?? '').trim(),
      municipality: (cells[columnIndex.municipality] ?? '').trim(),
      province: (cells[columnIndex.province] ?? '').trim(),
      provinceCode: (cells[columnIndex.provinceCode] ?? '').trim(),
      autonomousCommunity: (cells[columnIndex.autonomousCommunity] ?? '').trim(),
    };
  });
}

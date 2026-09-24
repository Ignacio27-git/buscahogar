// Adaptación al NGMEP real (paso 1.13 continuado) — decodifica
// `PROVINCIAS.csv` (docs/BD_Municipios-Entidades/PROVINCIAS.csv), PURO, sin
// IO. Cabecera real verificada (R7): `COD_PROV;PROVINCIA;COD_CA;
// COMUNIDAD_AUTONOMA;CAPITAL`. Es el único fichero real que trae
// `COMUNIDAD_AUTONOMA` — `MUNICIPIOS.csv` no la lleva — y la tabla maestra
// de códigos de provincia que `join.ts` usa para activar la mitad de la
// puerta de cordura que llevaba inerte desde que se escribió (nunca hubo
// una tabla de provincias contra la que comprobar `COD_PROV`).
export type ProvinciasFieldKey = 'provinceCode' | 'province' | 'autonomousCommunity';

export type ProvinciasFieldMap = Readonly<Record<ProvinciasFieldKey, string>>;

export const PROVINCIAS_FIELD_MAP: ProvinciasFieldMap = {
  provinceCode: 'COD_PROV',
  province: 'PROVINCIA',
  autonomousCommunity: 'COMUNIDAD_AUTONOMA',
};

export interface ProvinciaRow {
  readonly provinceCode: string;
  readonly province: string;
  readonly autonomousCommunity: string;
}

export class MissingProvinciaColumnError extends Error {
  constructor(missingHeaderName: string, observedHeaderRow: readonly string[]) {
    super(
      `Falta la columna de PROVINCIAS.csv "${missingHeaderName}" (PROVINCIAS_FIELD_MAP) en el fichero. ` +
        `Cabecera vista: [${observedHeaderRow.join(', ')}]`
    );
  }
}

// Mismo divisor mínimo que ngmep-parse.ts/ine-register.ts — comillas dobles
// con escape `""`, suficiente para un fichero administrativo.
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

export function parseProvinciasCsv(
  csvText: string,
  delimiter: string,
  fieldMap: ProvinciasFieldMap = PROVINCIAS_FIELD_MAP
): readonly ProvinciaRow[] {
  const lines = splitLines(csvText);
  if (lines.length === 0) {
    return [];
  }

  const header = splitCsvLine(lines[0] ?? '', delimiter);
  const columnIndex = {} as Record<ProvinciasFieldKey, number>;
  for (const [field, headerName] of Object.entries(fieldMap) as [ProvinciasFieldKey, string][]) {
    const index = header.indexOf(headerName);
    if (index === -1) {
      throw new MissingProvinciaColumnError(headerName, header);
    }
    columnIndex[field] = index;
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    return {
      provinceCode: (cells[columnIndex.provinceCode] ?? '').trim(),
      province: (cells[columnIndex.province] ?? '').trim(),
      autonomousCommunity: (cells[columnIndex.autonomousCommunity] ?? '').trim(),
    };
  });
}

// ROADMAP 1.13 (diseño DD-3, R7) + adaptación al fichero real (continuación
// 1.13) — R7 exigía verificar cuatro cosas contra el fichero real antes de
// rellenar `NGMEP_FIELD_MAP`; ya están verificadas contra
// `docs/BD_Municipios-Entidades/MUNICIPIOS.csv` (202603_NGMEP.mdb, IGN/CNIG,
// marzo 2026):
//   1. `COD_INE` tiene 11 dígitos (no 5): el código de municipio real son
//      sus 5 primeros caracteres — la derivación vive en `join.ts`, nunca
//      aquí (este módulo sigue sin truncar nada en silencio);
//   2. cabecera verbatim: `COD_INE;ID_REL;COD_GEO;COD_PROV;PROVINCIA;
//      NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;PERIMETRO;COD_INE_CAPITAL;
//      CAPITAL;POBLACION_CAPITAL;HOJA_MTN25;LONGITUD_ETRS89_REGCAN95;
//      LATITUD_ETRS89_REGCAN95;ORIGENCOOR;ALTITUD;ORIGENALTITUD`;
//   3. grados decimales, con COMA decimal (`-2,512507724`) — nunca DMS, pero
//      tampoco el punto que `Number`/`parseFloat` esperan (ver
//      `numeric.ts`: `parseFloat('-2,512507724')` trunca a `-2` en
//      silencio, de ahí `parseCommaDecimal`);
//   4. delimitador `;`, codificación Latin-1 (ISO-8859-1), CRLF — confirmado
//      con `file(1)`, decodificado en la capa IO
//      (`scripts/import-municipality-catalogue.ts`), nunca aquí.
//
// MUNICIPIOS.csv ya es una fila por municipio (8132 filas): a diferencia del
// diseño original (pensado para ENTIDADES.csv, ~150k filas, con varias
// "entidades" por municipio a desambiguar), no hace falta guardar
// "entidades hermanas" — `SUPERFICIE` sustituye a la heurística de
// esparcimiento entre hermanas para el radio de barrido (`geo.ts`).
import { z } from 'zod';

import { parseCommaDecimal } from './numeric.js';

export type NgmepFieldKey = 'entityCode' | 'name' | 'provinceCode' | 'superficieHectares' | 'latitude' | 'longitude';

export type NgmepFieldMap = Readonly<Record<NgmepFieldKey, string>>;

// Cabecera REAL de MUNICIPIOS.csv, verificada contra el fichero en mano
// (R7). `entityCode` es `COD_INE` (11 dígitos, se deriva a 5 en join.ts,
// nunca aquí).
export const NGMEP_FIELD_MAP: NgmepFieldMap = {
  entityCode: 'COD_INE',
  name: 'NOMBRE_ACTUAL',
  provinceCode: 'COD_PROV',
  superficieHectares: 'SUPERFICIE',
  longitude: 'LONGITUD_ETRS89_REGCAN95',
  latitude: 'LATITUD_ETRS89_REGCAN95',
};

export interface NgmepRow {
  readonly entityCode: string;
  readonly name: string;
  readonly provinceCode: string;
  readonly superficieHectares: number;
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

// ROADMAP 1.15 (paso 3, PR3) — spec #261, capability runtime-config-validation:
// "The Importer's CLI Arguments And CSV Rows Are Zod-Validated, Never
// Hand-Parsed". Una fila que falla el esquema (texto vacío en cualquiera de
// las tres columnas de texto) aborta TODA la importación, nombrando la fila
// (número de línea del fichero; la primera fila de datos es la 2) y el COD_INE crudo visto — nunca se
// descarta en silencio (mismo principio fail-loud que
// MalformedMunicipalityCodeError en join.ts).
export class MalformedNgmepRowError extends Error {
  constructor(rowNumber: number, rawRow: Readonly<Record<NgmepFieldKey, string>>, cause: z.ZodError) {
    const detail = cause.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`).join('; ');
    super(
      `Fila NGMEP nº ${String(rowNumber)} (COD_INE="${rawRow.entityCode}") inválida: ${detail}. ` +
        'Se aborta la importación completa — ninguna fila se descarta en silencio.'
    );
  }
}

// Solo las tres columnas de texto se validan aquí como "forma" (no vacías
// tras recortar espacios); las tres numéricas delegan en parseCommaDecimal
// DENTRO de un `.transform()` — nunca `z.coerce.number()`, que interpretaría
// la coma decimal del fichero real como separador de miles y truncaría en
// silencio (ver numeric.ts y AI-NOTES). Si parseCommaDecimal lanza
// MalformedDecimalError, esa excepción NO es un ZodError: se propaga tal
// cual fuera de `.parse()`, sin que parseNgmepCsv la envuelva — mismo
// comportamiento fail-loud que tenía antes de este refactor, ahora
// verificado explícitamente por el test de este módulo.
const ngmepRowSchema = z.object({
  entityCode: z.string().trim().min(1, 'código de entidad (COD_INE) vacío'),
  name: z.string().trim().min(1, 'nombre de municipio (NOMBRE_ACTUAL) vacío'),
  provinceCode: z.string().trim().min(1, 'código de provincia (COD_PROV) vacío'),
  superficieHectares: z.string().transform((raw) => parseCommaDecimal(raw)),
  latitude: z.string().transform((raw) => parseCommaDecimal(raw)),
  longitude: z.string().transform((raw) => parseCommaDecimal(raw)),
});

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

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line, delimiter);
    const rawRow: Readonly<Record<NgmepFieldKey, string>> = {
      entityCode: cells[columnIndex.entityCode] ?? '',
      name: cells[columnIndex.name] ?? '',
      provinceCode: cells[columnIndex.provinceCode] ?? '',
      superficieHectares: cells[columnIndex.superficieHectares] ?? '',
      latitude: cells[columnIndex.latitude] ?? '',
      longitude: cells[columnIndex.longitude] ?? '',
    };

    try {
      // Coma decimal (`-2,512507724`, `8806,81`): parseCommaDecimal (dentro
      // del `.transform()` del esquema) nunca trunca en la coma en silencio
      // — a diferencia del `Number(...)` anterior, que ni siquiera
      // truncaba: devolvía NaN.
      return ngmepRowSchema.parse(rawRow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // +2: 1 por la cabecera, 1 porque `index` es 0-based — número de
        // línea de datos real dentro del fichero.
        throw new MalformedNgmepRowError(index + 2, rawRow, error);
      }
      // MalformedDecimalError (u otra excepción no-Zod del `.transform()`):
      // se propaga sin envolver, comportamiento preexistente intacto.
      throw error;
    }
  });
}

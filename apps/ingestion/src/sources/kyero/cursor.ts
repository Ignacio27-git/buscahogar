// Paso 1.14 — codec de cursor de paginado en memoria (diseño D11). El
// cursor es el offset decimal dentro del conjunto filtrado y ordenado por
// id de ESTA consulta — nunca un índice sobre el feed crudo, así que un
// reordenamiento del dump entre dos barridos no lo invalida silenciosamente
// (la ordenación por id lo mitiga, no lo elimina; ver diseño, "Open
// questions"). Malformado o fuera de rango SIEMPRE rechaza — nunca cae por
// defecto a la página 0, mismo principio que cursor.ts de Idealista.
import { KyeroInvalidCursorError } from './errors.js';

const CURSOR_PATTERN = /^(0|[1-9]\d*)$/;

export function encodeCursor(offset: number): string {
  return String(offset);
}

// Formato + rango en un único paso (D11): entero decimal sin ceros a la
// izquierda, múltiplo de pageSize, y dentro de [0, length) — salvo conjunto
// vacío, donde solo el offset 0 es válido (primera página de un resultado
// vacío, no un error).
export function decodeCursor(cursor: string, pageSize: number, length: number): number {
  if (!CURSOR_PATTERN.test(cursor)) {
    throw new KyeroInvalidCursorError(cursor, 'debe ser un entero decimal sin signo, sin ceros a la izquierda.');
  }

  const offset = Number(cursor);

  if (offset % pageSize !== 0) {
    throw new KyeroInvalidCursorError(cursor, `debe ser múltiplo del tamaño de página (${String(pageSize)}).`);
  }

  const outOfRange = length === 0 ? offset !== 0 : offset >= length;
  if (outOfRange) {
    throw new KyeroInvalidCursorError(cursor, `fuera de rango: el conjunto filtrado tiene ${String(length)} elementos.`);
  }

  return offset;
}

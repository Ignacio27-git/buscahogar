// Paso 1.6 — codec de cursor de barrido (diseño, sección "Data flow").
// "<filtro>:<numPage>" sobre la tupla congelada de filters.ts. Por nombre,
// no por índice: un índice obsoleto apuntaría en silencio a otro filtro si
// la tupla se reordena (DECISIONS 032); un nombre desconocido rechaza
// fuerte. Malformado SIEMPRE rechaza — nunca cae en un valor por defecto,
// porque eso volvería a pedir peticiones ya pagadas.
import { InvalidCursorError } from './errors.js';
import { IDEALISTA_FILTERS, type IdealistaFilter } from './filters.js';

// Re-exportado desde aquí para que un consumidor de cursor.ts (encode/decode)
// no tenga que importar también errors.ts solo para capturar el tipo de
// rechazo — errors.ts sigue siendo la única fuente de la clase en sí.
export { InvalidCursorError };

export interface SweepPosition {
  readonly filter: IdealistaFilter;
  readonly page: number;
}

function isIdealistaFilter(value: string): value is IdealistaFilter {
  return (IDEALISTA_FILTERS as readonly string[]).includes(value);
}

export function encodeCursor(position: SweepPosition): string {
  return `${position.filter}:${String(position.page)}`;
}

export function decodeCursor(cursor: string): SweepPosition {
  const separatorIndex = cursor.indexOf(':');
  if (separatorIndex === -1) {
    throw new InvalidCursorError(cursor, 'falta el separador ":" entre filtro y página.');
  }

  const filterPart = cursor.slice(0, separatorIndex);
  const pagePart = cursor.slice(separatorIndex + 1);

  if (!isIdealistaFilter(filterPart)) {
    throw new InvalidCursorError(cursor, `filtro desconocido "${filterPart}".`);
  }

  if (!/^\d+$/.test(pagePart)) {
    throw new InvalidCursorError(cursor, `número de página inválido "${pagePart}": debe ser un entero positivo.`);
  }

  const page = Number(pagePart);
  if (page <= 0) {
    throw new InvalidCursorError(cursor, `número de página inválido "${pagePart}": debe ser un entero positivo.`);
  }

  return { filter: filterPart, page };
}

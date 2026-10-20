// Paso 3.2 (seguimiento, docs/DECISIONS.md, decisión 247) — reparto de filas o
// ids en lotes que caben en una sola sentencia de PostgreSQL.
//
// El protocolo de PostgreSQL transmite el número de parámetros ligados de un
// mensaje Bind como entero de 16 bits sin signo: como mucho 65 535 por
// sentencia. Por encima, el recuento se desborda en silencio (99 880 llegó
// como 34 344) y el servidor responde 08P01 "bind message has N parameter
// formats but 0 parameters". Un INSERT multi-fila liga un parámetro por
// columna y fila, y un `inArray` uno por id: ambos crecen con el corpus.
//
// Sin dependencias de Drizzle ni de la base de datos: es aritmética pura, y
// cada llamador decide cuántos parámetros cuesta cada elemento.

export const POSTGRES_MAX_BIND_PARAMETERS = 65_535;

// Margen deliberado de más de la mitad bajo el tope: el llamador calcula el
// coste por fila como el número TOTAL de columnas de la tabla (cota superior:
// las columnas con `default` no ligan parámetro), y una sentencia puede ligar
// alguno más fuera de las filas (un WHERE, un ON CONFLICT). Lotes de unos
// miles de filas no cuestan nada medible en ida y vuelta.
export const BIND_PARAMETER_BUDGET = 30_000;

// Parte `items` en lotes consecutivos, en el mismo orden y sin perder ni
// duplicar ninguno, de modo que `lote.length × parametersPerItem` nunca
// supere `budget`. Una entrada vacía no produce lotes: Drizzle rechaza
// `.values([])`, así que el llamador puede iterar sin comprobarlo.
export function chunkByBindParameters<T>(
  items: readonly T[],
  parametersPerItem: number,
  budget: number = BIND_PARAMETER_BUDGET
): T[][] {
  if (!Number.isInteger(parametersPerItem) || parametersPerItem <= 0) {
    throw new RangeError(
      `chunkByBindParameters: parametersPerItem debe ser un entero positivo (recibido ${String(parametersPerItem)}).`
    );
  }
  if (parametersPerItem > budget) {
    throw new RangeError(
      `chunkByBindParameters: un solo elemento (${String(parametersPerItem)} parámetros) no cabe en el presupuesto de ${String(budget)}.`
    );
  }

  const itemsPerBatch = Math.floor(budget / parametersPerItem);
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += itemsPerBatch) {
    batches.push(items.slice(offset, offset + itemsPerBatch));
  }
  return batches;
}

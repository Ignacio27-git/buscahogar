// Unión cerrada de tipo de operación. Comparte vocabulario entre respuesta y
// petición en toda fuente conocida (a diferencia de PropertyType — ver
// docs/DECISIONS.md, decisión 027), por eso es el único filtro que
// AreaQuery exige como campo obligatorio.
export const OPERATION_TYPES = ['sale', 'rent'] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

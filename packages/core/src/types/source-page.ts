// Página de resultados crudos de una fuente, previa a la normalización.
// `T` es siempre el payload sin normalizar de la fuente, nunca un Listing.
export interface SourcePage<T = unknown> {
  readonly items: readonly T[];
  // Cursor de continuación. Envuelve un número de página (evidencia de la
  // sonda, obs #81), no un token opaco de servidor; el tipo sigue siendo
  // `string` porque la semántica queda documentada aquí, no en el tipo.
  readonly nextCursor?: string;
  readonly total?: number;
}

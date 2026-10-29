// D.17 (B9, decisión 211) — rótulo del estado de un anuncio. Una sola palabra para el mismo estado
// en toda la ficha (la fila de la fuente y la insignia del histórico): antes un anuncio retirado era
// «Retirado» en una y «(no disponible)» en la otra. «No disponible» era ya la palabra dominante
// (cabecera de la ficha, anuncios inactivos y estados desconocidos).
export const AVAILABLE_LABEL = 'Disponible';
export const UNAVAILABLE_LABEL = 'No disponible';

// Solo el valor exacto `'active'` es disponible, igual que el SQL: cualquier otro estado (inactivo,
// retirado o uno que el tipo no contempla) es no disponible. D.19 (decisión 231): el rótulo y el verde
// de «Disponible» salen de este mismo predicado, así que nunca pueden contradecirse.
export function isListingAvailable(status: string): boolean {
  return status === 'active';
}

export function listingStatusLabel(status: string): string {
  return isListingAvailable(status) ? AVAILABLE_LABEL : UNAVAILABLE_LABEL;
}

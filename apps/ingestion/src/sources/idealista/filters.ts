// Paso 1.6 — tupla congelada de los cinco filtros que cubre un barrido
// completo de Idealista. El orden es significativo: la posición de un
// filtro en la tupla implica que todos los filtros anteriores ya están
// agotados — el cursor nunca los enumera uno por uno (ver cursor.ts).
// Reordenar esta tupla invalida cualquier cursor en vuelo (DECISIONS 032).
//
// El vocabulario de la tupla es el de la PETICIÓN (homes/offices/premises/
// garages/bedrooms), distinto del vocabulario de la RESPUESTA
// (flat/duplex/penthouse/premise/…, DECISIONS 027) — nunca se mezclan.
export const IDEALISTA_FILTERS = ['homes', 'offices', 'premises', 'garages', 'bedrooms'] as const;

export type IdealistaFilter = (typeof IDEALISTA_FILTERS)[number];

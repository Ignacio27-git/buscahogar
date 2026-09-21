// ROADMAP 1.13 (diseño DD-1/DD-22, arbitraje CR-13) — plegado de acentos y
// minúsculas, PURO, sin dependencia de PostgreSQL. Compartido entre el
// conversor del catálogo municipal (`apps/ingestion/src/catalogue`, que lo
// usa para poblar `locations.search_name`) y la búsqueda web (que pliega la
// consulta tecleada por el usuario). Una única implementación evita que las
// dos mitades del sistema diverjan silenciosamente.
//
// `unaccent()` de PostgreSQL es STABLE, no IMMUTABLE (comprobado contra el
// catálogo de funciones instalado), así que no puede respaldar una columna
// generada ni un índice de expresión sin una función IMMUTABLE envolvente —
// de ahí que el plegado se resuelva aquí, en TypeScript, antes de escribir o
// consultar.
//
// Límite aceptado y documentado (decisión 066): esto pliega acentos, no
// resuelve alias bilingües ("A Coruña"/"La Coruña", "Donostia/San
// Sebastián"), y no introduce ninguna coincidencia difusa sobre una
// superficie que gasta cuota.
export function normalizeSearchName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

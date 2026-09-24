// ROADMAP 1.10 — selección del listing ganador dentro de un grupo (D4 del
// diseño; docs/DECISIONS.md, decisión 053), PURA: recibe candidatos ya
// hidratados, no consulta nada.
//
// El comparador tiene EXACTAMENTE tres claves, en este orden, y la tercera
// no es defensiva sino necesaria:
//   1. completeness DESC  — Q5: la completitud decide primero.
//   2. capturedAt   DESC  — Q4: la recencia de CAMBIO de contenido
//      (listing_versions.capturedAt) desempata, nunca la re-observación
//      (listings.lastSeenAt, deliberadamente ausente de WinnerCandidate).
//   3. listingId    ASC   — desempate final, orden TOTAL por construcción
//      (listings.id es uuid único). capturedAt es defaultNow() y Postgres
//      now() es hora de INICIO de transacción: toda versión insertada en un
//      mismo barrido comparte capturedAt exactamente, así que este empate es
//      el caso COMÚN, no el raro. Sin esta clave el ganador dependería del
//      orden de iteración del driver y el reproceso dejaría de ser
//      comparable (GROUP-4, determinismo).
import type { Listing } from '../schemas/listing.schema.js';

export interface WinnerCandidate {
  readonly listing: Listing;
  readonly listingId: string;
  readonly capturedAt: Date;
}

// Exactamente los siete campos OPCIONALES de contenido de Listing
// (listing.schema.ts:30-37). `operation`/`propertyType` son enums
// obligatorios — presentes siempre, así que no discriminan nada y solo
// engañarían a quien leyera esta lista pensando que sí lo hacen.
// `coordinates` queda deliberadamente fuera: el bloqueo excluye cualquier
// par con geometría NULL (blocking.ts:101), así que todo miembro de un
// grupo con más de un integrante tiene coordenadas por construcción, y un
// singleton no tiene con qué comparar — incluirla no cambiaría ningún
// resultado.
const COMPLETENESS_FIELDS = [
  'surfaceM2',
  'rooms',
  'bathrooms',
  'floor',
  'title',
  'description',
  'address',
] as const satisfies readonly (keyof Listing)[];

export function countCompleteness(listing: Listing): number {
  let count = 0;
  for (const field of COMPLETENESS_FIELDS) {
    // `!== undefined`, nunca una comprobación de veracidad: un valor falsy
    // real (p. ej. floor "0", planta baja) cuenta como presente.
    if (listing[field] !== undefined) {
      count += 1;
    }
  }
  return count;
}

export function selectWinningListing(candidates: readonly WinnerCandidate[]): WinnerCandidate {
  if (candidates.length === 0) {
    throw new Error('selectWinningListing: no se puede seleccionar un ganador sin candidatos');
  }

  return candidates.reduce((best, candidate) => (compareCandidates(candidate, best) < 0 ? candidate : best));
}

// Comparador en el sentido de Array.prototype.sort: negativo si `a` debe
// preceder a `b` (es decir, `a` gana el desempate).
function compareCandidates(a: WinnerCandidate, b: WinnerCandidate): number {
  const completenessDelta = countCompleteness(b.listing) - countCompleteness(a.listing);
  if (completenessDelta !== 0) {
    return completenessDelta;
  }

  const recencyDelta = b.capturedAt.getTime() - a.capturedAt.getTime();
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  return a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0;
}

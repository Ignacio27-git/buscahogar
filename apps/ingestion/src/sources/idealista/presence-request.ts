// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — construcción PURA de
// la petición de verificación por `adIds`. Mismos campos que la búsqueda de
// barrido (search-request.ts) más `adIds`. Nunca toca la red.
//
// - `center`: centroide de la zona; `distance`: radio del círculo de barrido más
//   un margen operativo (un anuncio cerca del borde no debe quedar fuera por el
//   redondeo o por coordenadas ofuscadas).
// - `propertyType`: el filtro del grupo del lote (groupKey).
// - `maxItems` 50 y `numPage` 1: un lote (≤ 50 ids) cabe en una sola página; el
//   clasificador trata `totalPages > 1` como ambiguo.
// - `adIds`: ids separados por comas. La codificación exacta aún no está
//   confirmada por la sonda (scripts/probe-idealista-adids.ts lo mide con una
//   petición de dos ids): si la API la ignorase, los ids ajenos devueltos harían
//   ambiguo el lote (presence-classify.ts), nunca un retiro.
import type { PresenceBatch } from '@buscahogar/core';

import type { SearchField } from './search-request.js';

const PRESENCE_MAX_ITEMS = '50';
const FIRST_PAGE = '1';

export function buildPresenceFields(batch: PresenceBatch, radiusMarginM: number): readonly SearchField[] {
  return [
    { name: 'center', value: `${String(batch.center.latitude)},${String(batch.center.longitude)}` },
    { name: 'distance', value: String(Math.round(batch.radiusMeters + radiusMarginM)) },
    { name: 'propertyType', value: batch.groupKey },
    { name: 'operation', value: batch.operation },
    { name: 'maxItems', value: PRESENCE_MAX_ITEMS },
    { name: 'numPage', value: FIRST_PAGE },
    { name: 'adIds', value: batch.externalIds.join(',') },
  ];
}

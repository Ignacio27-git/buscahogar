// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — mapa INVERSO: del
// `propertyType` CRUDO de la respuesta (flat/penthouse/duplex/premise/…,
// DECISIONS 027) al filtro `propertyType` de la PETICIÓN (homes/premises/…).
// Idealista exige el filtro en toda petición; el que se usó en el barrido no se
// guarda, así que se reconstruye del tipo crudo de la versión vigente.
//
// Solo se mapean los tipos con EVIDENCIA en las fixtures commiteadas: flat,
// penthouse y duplex aparecen en `homes`; premise en `premises`. `chalet` (el
// mapa de dominio lo trata como `house`) NO tiene evidencia de en qué filtro
// aparece y se deja sin mapear a propósito: un filtro equivocado haría que la
// API OMITIERA un anuncio vivo, y con la omisión confirmada sería retirado por
// error. Sin mapa no hay petición y el id queda ambiguo (S-LR-11).
import type { IdealistaFilter } from './filters.js';

const FILTER_BY_RAW_TYPE: Readonly<Record<string, IdealistaFilter>> = {
  flat: 'homes',
  penthouse: 'homes',
  duplex: 'homes',
  premise: 'premises',
};

export function filterForRawType(rawPropertyType: string | null | undefined): IdealistaFilter | null {
  if (rawPropertyType === null || rawPropertyType === undefined) {
    return null;
  }
  return Object.hasOwn(FILTER_BY_RAW_TYPE, rawPropertyType) ? (FILTER_BY_RAW_TYPE[rawPropertyType] ?? null) : null;
}

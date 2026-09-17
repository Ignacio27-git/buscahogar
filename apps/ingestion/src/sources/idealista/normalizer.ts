// Paso 1.6 — IdealistaListingNormalizer (diseño D9). Traduce un
// IdealistaElement ya validado por rawElementSchema al Listing de dominio.
//
// Reconciliación #2 (tareas, obs #106): spec exige que `normalize()` lance
// para price inválido; el diseño (D3) afirma que nunca lanza porque
// rawElementSchema ya filtró price inválido ANTES de llegar aquí. Ambas
// cosas son ciertas en puntos distintos del pipeline: dentro del barrido
// 1.6/1.7, `normalize()` nunca se invoca sobre un elemento que no haya
// pasado ya rawElementSchema (esta llamada es responsabilidad de 1.7, fuera
// de alcance aquí). Pero el TIPO `IdealistaElement` no puede expresar en
// compilación la comprobación en runtime `.positive()`, así que un
// llamador que construya un IdealistaElement a mano (como hacen los propios
// tests de este fichero) y pase un price inválido debe seguir recibiendo un
// fallo explícito, nunca un Listing con un precio inventado — eso
// corrompería en silencio el bloqueo por banda de precio de la
// deduplicación. Por eso `normalize` conserva esta única comprobación
// redundante con rawElementSchema: es la última línea de defensa del
// propio contrato de la función, no solo del pipeline que la rodea.
import type { Listing, ListingNormalizer } from '@buscahogar/core';

import { mapPropertyType } from './property-type-map.js';
import type { IdealistaElement } from './raw-element.schema.js';

const SOURCE_ID = 'idealista';

export class NormalizationError extends Error {}

export class IdealistaListingNormalizer implements ListingNormalizer<IdealistaElement> {
  normalize(raw: IdealistaElement): Listing {
    if (typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) {
      throw new NormalizationError(
        `price inválido para propertyCode=${String(raw.propertyCode)}: ${JSON.stringify(raw.price)}`
      );
    }

    const coordinates =
      raw.latitude !== undefined && raw.longitude !== undefined
        ? { latitude: raw.latitude, longitude: raw.longitude }
        : undefined;

    const listing: Listing = {
      sourceId: SOURCE_ID,
      externalId: String(raw.propertyCode),
      url: raw.url,
      operation: raw.operation,
      propertyType: mapPropertyType(raw.propertyType),
      priceCents: Math.round(raw.price * 100),
      surfaceM2: raw.size,
      rooms: raw.rooms,
      bathrooms: raw.bathrooms,
      floor: raw.floor,
      title: raw.suggestedTexts?.title,
      description: raw.description,
      address: raw.address,
      // ROADMAP 1.11 — docs/DECISIONS.md, decisión 059.
      thumbnailUrl: raw.thumbnail,
      coordinates,
      // Siempre undefined en esta fuente: no hay campo INE/provincia/CCAA
      // (location) y `showAddress` no es una señal válida de ofuscación
      // (coordinatesObfuscated, DECISIONS 026).
      location: undefined,
      coordinatesObfuscated: undefined,
      // D8: catálogo de features diferido; `[]` es un valor válido según
      // `listingSchema` (`.default([])`).
      features: [],
    };

    return listing;
  }
}

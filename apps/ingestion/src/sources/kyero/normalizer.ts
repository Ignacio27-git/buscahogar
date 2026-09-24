// Paso 1.14 — KyeroListingNormalizer (diseño, "Normalizer map"). Traduce un
// KyeroProperty ya elegible (isEligible ya pasó, kyero-source.ts) a un
// Listing. `normalize` conserva de todos modos la comprobación de moneda y
// de operación (D7 caveat, mismo patrón que
// apps/ingestion/src/sources/idealista/normalizer.ts con `price`): el tipo
// TS de KyeroProperty no expresa en compilación la eligibilidad decidida en
// runtime por area-filter.ts, así que esta es la última línea de defensa
// del propio contrato de la función.
import type { Listing, ListingNormalizer } from '@buscahogar/core';

import { extractCoordinates, mapOperation } from './area-filter.js';
import { KyeroNormalizationError } from './errors.js';
import { mapPropertyType } from './property-type-map.js';
import type { KyeroProperty } from './raw-property.schema.js';

const SOURCE_ID = 'kyero';

// G1/G1b: desc y url pueden llegar como texto plano o como objeto
// lang->texto. Precedencia es > en > primera clave disponible — mismo
// orden documentado en el diseño (research gaps, G1).
function pickLocalizedText(value: string | Readonly<Record<string, string>>): string {
  if (typeof value === 'string') return value;
  if (value.es !== undefined) return value.es;
  if (value.en !== undefined) return value.en;
  return Object.values(value)[0] ?? '';
}

function countImages(raw: KyeroProperty): number | undefined {
  return raw.images?.image === undefined ? undefined : raw.images.image.length;
}

export class KyeroListingNormalizer implements ListingNormalizer<KyeroProperty> {
  normalize(raw: KyeroProperty): Listing {
    if (raw.currency !== undefined && raw.currency !== 'EUR') {
      throw new KyeroNormalizationError(`moneda no soportada para id=${raw.id}: ${raw.currency}`);
    }

    const operation = mapOperation(raw.price_freq);
    if (operation === 'invalid') {
      throw new KyeroNormalizationError(`price_freq inválido para id=${raw.id}: ${String(raw.price_freq)}`);
    }

    const listing: Listing = {
      sourceId: SOURCE_ID,
      externalId: raw.id,
      url: pickLocalizedText(raw.url),
      operation,
      propertyType: mapPropertyType(raw.type),
      priceCents: Math.round(raw.price * 100),

      surfaceM2: raw.surface_area?.built,
      rooms: raw.beds,
      bathrooms: raw.baths,
      description: raw.desc === undefined ? undefined : pickLocalizedText(raw.desc),
      coordinates: extractCoordinates(raw),
      numPhotos: countImages(raw),

      // El feed no ofrece ningún dato fiable para estos campos (diseño,
      // "Normalizer map"): town/province no es una dirección exacta y
      // contaminaría la señal de dedup por dirección (CLAUDE.md, "mismo
      // bloque ≠ misma vivienda"); no hay resolución INE; el feed no trae
      // un título separado de desc; y no hay señal de ofuscación.
      title: undefined,
      address: undefined,
      location: undefined,
      coordinatesObfuscated: undefined,
      // thumbnailUrl NUNCA se puebla en esta fuente (spec "thumbnailUrl
      // Never Populated"): apps/web no tiene el host de imágenes de Kyero
      // en su allowlist de next.config.ts (fuera de alcance, proposal).
      thumbnailUrl: undefined,
      // Catálogo de features diferido, igual que Idealista (D8 de #103).
      features: [],
    };

    return listing;
  }
}

// Paso 1.7 — LISTING_FIELD_POLICY (diseño D4, mitigación de R2). Clasifica
// cada campo de `Listing` según su destino de persistencia. El mapped type
// `{ readonly [K in keyof Listing]-?: FieldPolicy }` EXIGE una entrada por
// cada clave: añadir un campo a `listingSchema` sin clasificarlo aquí deja
// de compilar (TS2741) — `pnpm typecheck` lo confirma, no es un test en
// tiempo de ejecución. El conjunto comparado por version-columns.ts se
// DERIVA de este objeto (VERSION_COLUMN_FIELDS), nunca se repite a mano.
import type { Listing } from '@buscahogar/core';

// Forma proyectada a espacio de columna (listing_versions.*). Vive aquí
// porque FieldPolicy la referencia (`keyof VersionColumns`) y este fichero
// se implementa antes que version-columns.ts en el checklist (tareas 1.6-1.7
// preceden a 1.8-1.9) — version-columns.ts importa este tipo, no al revés.
export interface VersionColumns {
  readonly priceCents: number;
  readonly surfaceM2: number | undefined;
  readonly rooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly floor: string | undefined;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly address: string | undefined;
  readonly propertyType: string;
  readonly operation: string;
}

export type FieldPolicy =
  | { readonly kind: 'version-column'; readonly column: keyof VersionColumns }
  | {
      readonly kind: 'identity-column';
      readonly column: 'url' | 'location' | 'locationId' | 'coordinatesObfuscated';
    }
  | { readonly kind: 'identity-key' }
  | { readonly kind: 'not-persisted'; readonly reason: string };

// Cada fila cita el destino exacto verificado contra el esquema (diseño D4).
// `coordinates` (Listing) → `listings.location`; `location` (Listing) →
// `listings.locationId` FK — nombres deliberadamente cruzados, documentados
// aquí en vez de en un comentario disperso.
export const LISTING_FIELD_POLICY: { readonly [K in keyof Listing]-?: FieldPolicy } = {
  sourceId: { kind: 'identity-key' },
  externalId: { kind: 'identity-key' },
  url: { kind: 'identity-column', column: 'url' },
  operation: { kind: 'version-column', column: 'operation' },
  propertyType: { kind: 'version-column', column: 'propertyType' },
  priceCents: { kind: 'version-column', column: 'priceCents' },
  surfaceM2: { kind: 'version-column', column: 'surfaceM2' },
  rooms: { kind: 'version-column', column: 'rooms' },
  bathrooms: { kind: 'version-column', column: 'bathrooms' },
  floor: { kind: 'version-column', column: 'floor' },
  title: { kind: 'version-column', column: 'title' },
  description: { kind: 'version-column', column: 'description' },
  address: { kind: 'version-column', column: 'address' },
  coordinates: { kind: 'identity-column', column: 'location' },
  location: { kind: 'identity-column', column: 'locationId' },
  coordinatesObfuscated: { kind: 'identity-column', column: 'coordinatesObfuscated' },
  features: {
    kind: 'not-persisted',
    reason: 'catálogo de Feature diferido (1.6 D8); esta fuente emite siempre [] — cero filas en listing_features.',
  },
};

function isVersionColumnField(field: keyof Listing): boolean {
  return LISTING_FIELD_POLICY[field].kind === 'version-column';
}

// Derivado, nunca hand-maintained (R2): si un campo nuevo se clasifica como
// version-column arriba, empieza a compararse en version-columns.ts sin
// tocar ese fichero. El cast final es seguro por construcción: todo campo
// 'version-column' del objeto anterior nombra una clave real de
// VersionColumns (mismo literal en ambos lados).
export const VERSION_COLUMN_FIELDS = (Object.keys(LISTING_FIELD_POLICY) as (keyof Listing)[]).filter(
  isVersionColumnField
) as readonly (keyof VersionColumns)[];

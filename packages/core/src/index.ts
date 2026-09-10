// Agregador inmobiliario — modelo de dominio
//
// Este paquete contiene:
// - Tipos e interfaces del modelo de dominio (types/)
// - Esquemas Zod para validación en las fronteras externas reales (schemas/)
// - Contratos intercambiables (contracts/)
//
// NO importa Next, React, ORM ni dependencias específicas de apps. Ver
// eslint.config.mjs: la regla no-restricted-imports lo hace mecánico, no
// solo una línea de revisión manual (ROADMAP 1.4).
//
// Este fichero es la superficie pública deliberadamente explícita: usa
// reexports nombrados, no `export *` — a diferencia de packages/db, que sí
// usa `export *` porque su barril es interno al monorepo. `core` es el
// paquete del que dependen el resto de workspaces, así que un fichero que
// enumera literalmente su API pública vale más en revisión que la brevedad.
// Los sub-barriles (types/index.ts, schemas/index.ts, contracts/index.ts) sí
// usan `export *` — son agregación interna, no el contrato.
//
// Convención deliberadamente mixta: los dos tipos que cruzan una frontera
// externa real (`Listing`, salida del normalizador; `AreaQuery`, entrada de
// CLI y de search params) se derivan del esquema Zod con `z.infer`, porque
// ahí la deriva entre tipo y validación es cara. El resto son tipos escritos
// a mano: nunca se parsean, y esquematizarlos añadiría maquinaria de
// validación sin entrada externa que validar (decisión 023).
export type { PropertyType } from './types/property-type.js';
export { PROPERTY_TYPES } from './types/property-type.js';
export type { OperationType } from './types/operation-type.js';
export { OPERATION_TYPES } from './types/operation-type.js';
export type { Coordinates } from './types/coordinates.js';
export type { Location } from './types/location.js';
export type { AppliedFeature, Feature } from './types/feature.js';
export type { SignalBreakdown, SignalScore, SimilarityResult } from './types/similarity.js';
export type { SourcePage } from './types/source-page.js';

export type { Listing } from './schemas/listing.schema.js'; // derivado con z.infer
export { listingSchema } from './schemas/listing.schema.js';
export type { AreaQuery } from './schemas/area-query.schema.js'; // derivado con z.infer
export { areaQuerySchema } from './schemas/area-query.schema.js';

export type { DedupStrategy } from './contracts/dedup-strategy.js';
export type { ListingNormalizer } from './contracts/listing-normalizer.js';
export type { PropertySource } from './contracts/property-source.js';

export const CORE_VERSION = '0.0.1';

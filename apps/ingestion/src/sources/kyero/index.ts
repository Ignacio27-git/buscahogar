// Paso 1.14 — barril del adaptador de Kyero. Reexports explícitos y
// nombrados, nunca `export *` — mismo estilo que
// apps/ingestion/src/sources/idealista/index.ts. No se toca
// apps/ingestion/src/index.ts: nada lo consume todavía (proposal, fuera de
// alcance).
export { createKyeroSource } from './kyero-source.js';
export type { FeedFetcher, KyeroSource, KyeroSourceDiagnostics, KyeroSourceOptions } from './kyero-source.js';

export { KyeroListingNormalizer } from './normalizer.js';

export { rawPropertySchema } from './raw-property.schema.js';
export type { KyeroProperty } from './raw-property.schema.js';

export { parseFeed } from './feed-parser.js';

export { extractCoordinates, haversineMeters, isEligible, isInArea, mapOperation } from './area-filter.js';

export { describeMapping, mapPropertyType } from './property-type-map.js';
export type { PropertyTypeMapping } from './property-type-map.js';

export { decodeCursor, encodeCursor } from './cursor.js';

export {
  KyeroAreaMismatchError,
  KyeroFeedParseError,
  KyeroInvalidCursorError,
  KyeroNormalizationError,
  KyeroPageCapExceededError,
  KyeroSweepError,
} from './errors.js';

export { createHttpFeedFetcher } from './http-feed-fetcher.js';
export type { HttpFeedFetcherOptions } from './http-feed-fetcher.js';

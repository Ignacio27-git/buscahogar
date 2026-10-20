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
export type { CandidatePair } from './types/candidate-pair.js';
export type { ClassifiedPair } from './types/classified-pair.js';

export type { Listing } from './schemas/listing.schema.js'; // derivado con z.infer
export { listingSchema } from './schemas/listing.schema.js';
export type { AreaQuery } from './schemas/area-query.schema.js'; // derivado con z.infer
export { areaQuerySchema } from './schemas/area-query.schema.js';
export type { BlockingThresholds } from './schemas/blocking-thresholds.schema.js'; // derivado con z.infer
export { blockingThresholdsSchema } from './schemas/blocking-thresholds.schema.js';
export type { BandThresholds } from './schemas/band-thresholds.schema.js'; // derivado con z.infer
export { bandThresholdsSchema } from './schemas/band-thresholds.schema.js';
export type { SearchQuery, PropertySearchCriteria } from './schemas/search-query.schema.js'; // derivado con z.infer
export { searchQuerySchema } from './schemas/search-query.schema.js';
export type { PropertyDetailParams } from './schemas/property-detail-params.schema.js'; // derivado con z.infer
export { propertyDetailParamsSchema } from './schemas/property-detail-params.schema.js';
export { zoneQuerySchema, zoneSelectionSchema } from './schemas/zone-selection.schema.js';
// Búsqueda por zona dibujada y vista de mapa (ROADMAP 2.6, decisiones 115/118).
export { polygonParamSchema } from './schemas/polygon-param.schema.js';
// Búsqueda en lenguaje natural (ROADMAP 3.1, decisión 120): intérprete puro de
// español a parámetros de búsqueda. tokenize, amount y vocabulary son internos.
export { nlQuerySchema } from './schemas/nl-query.schema.js';
export { interpretSearchText, NL_PARAM_KEYS } from './nl-search/index.js';
export type {
  NlConflict,
  NlParamKey,
  NlSearchInterpretation,
  RecognisedFragment,
  TextSpan,
} from './nl-search/index.js';
export type { SearchView } from './schemas/search-view.schema.js';
export { SEARCH_VIEWS, searchViewSchema } from './schemas/search-view.schema.js';

export type { DedupStrategy } from './contracts/dedup-strategy.js';
export type { ListingNormalizer } from './contracts/listing-normalizer.js';
export type { PropertySource } from './contracts/property-source.js';

// Primera DedupStrategy concreta (ROADMAP 1.9). Deliberadamente NO
// exportados: pesos, umbrales, el piso de evidencia, el vocabulario de
// tokens de calle y las funciones de señal individuales — internos a
// `strategies/rule-based/`, siguiendo el mismo precedente que
// `coordinatesSchema` (barrel.test.ts:42-46). Los tests los alcanzan vía
// `../src/strategies/rule-based/...`, igual que el resto de tests de este
// paquete (contracts.test.ts:3-9).
export { haversineDistanceMeters } from './geo/distance.js';
// Geometría Web Mercator del mapa estático de la ficha (D.11, decisión 179).
export type { PixelPoint, StaticMapPlan, StaticMapTile, TileCoordinate } from './geo/tile-geometry.js';
export {
  APPROXIMATE_LOCATION_RADIUS_M,
  latLonToTile,
  metresPerPixel,
  planStaticMap,
  projectToWorldPixel,
  TILE_SIZE_PX,
  WEB_MERCATOR_MAX_LATITUDE,
} from './geo/tile-geometry.js';
// Códec puro del polígono (ROADMAP 2.6, decisión 115): lo usan el esquema de
// search params y el control de dibujo del navegador.
export type {
  PolygonIssueCode,
  PolygonParseResult,
  PolygonRing,
  PolygonVertex,
} from './geo/polygon.js';
export {
  formatPolygonParam,
  parsePolygonParam,
  POLYGON_MAX_AREA_KM2,
  POLYGON_MAX_PARAM_LENGTH,
  POLYGON_MAX_VERTICES,
  POLYGON_MIN_VERTICES,
  polygonAreaKm2,
  validatePolygonRing,
} from './geo/polygon.js';
export { normalizeSearchName } from './normalize-search-name.js';
export { ruleBasedDedupStrategy } from './strategies/rule-based/strategy.js';
export { classify, isVetoed } from './strategies/rule-based/classify.js';
export type { SimilarityBand } from './strategies/rule-based/classify.js';
// RULE_BASED_BAND_THRESHOLDS SÍ cruza el barril (a diferencia de
// WEIGHTS/T_HIGH/T_LOW, barrel.test.ts:105-114): es la forma tipada que
// necesita cualquier consumidor de `classify(result, thresholds)` fuera de
// este paquete, empezando por la evaluación offline (ROADMAP 2.2, decisión
// 088).
export { RULE_BASED_BAND_THRESHOLDS } from './strategies/rule-based/weights.js';

// Consolidación de viviendas canónicas (ROADMAP 1.10): los dos algoritmos
// puros que convierten pares clasificados en propiedades — agrupación por
// cierre transitivo (D3) y selección del listing ganador (D4). Ambos
// exportados por nombre, no `export *`, siguiendo la convención explícita
// de este barril (:12-18).
export { buildPropertyGroups } from './consolidation/grouping.js';
export type { PropertyGroup, RefusedComponent, GroupingResult } from './consolidation/grouping.js';
export { selectWinningListing, countCompleteness } from './consolidation/winner.js';
export type { WinnerCandidate } from './consolidation/winner.js';

// Segunda DedupStrategy, corpus etiquetado y evaluación (ROADMAP 2.2).
// Deliberadamente NO exportados: el prior y la tabla m/u/bits de la
// estrategia probabilística (`strategies/probabilistic/parameters.ts`) —
// mismo criterio que WEIGHTS/T_HIGH/T_LOW de rule-based (barrel.test.ts,
// tarea 4.10) — y las funciones de nivel individuales de `levels.ts`.
export { probabilisticDedupStrategy } from './strategies/probabilistic/strategy.js';
export { classifyProbabilistic, FS_BAND_THRESHOLDS } from './strategies/probabilistic/classify.js';
export type { GroundTruth, CorpusEntry, ExpectedBand } from './evaluation/dedup-corpus.js';
export { dedupCorpus } from './evaluation/dedup-corpus.js';
export { makeListing } from './evaluation/make-listing.js';
export type {
  LabeledBand,
  ConfusionCounts,
  Interval,
  Proportion,
  BinaryMetrics,
} from './evaluation/metrics.js';
export { wilsonInterval, computeMetrics } from './evaluation/metrics.js';
export type {
  StrategyEvaluator,
  PairEvaluation,
  SweepPoint,
  StrategyEvaluation,
} from './evaluation/evaluate.js';
export {
  DEFAULT_SWEEP,
  DEFAULT_EVALUATORS,
  RULE_BASED_EVALUATOR,
  PROBABILISTIC_EVALUATOR,
  evaluateStrategy,
} from './evaluation/evaluate.js';
// Corpus con referencias de imagen + evaluadores decorados (ROADMAP 2.3,
// Phase 4): `withCorpusImages`/`IMAGE_REFS` adjuntan las refs no-fetchables
// `fixture-image:eval/<id>-<a|b>` sin mutar `dedupCorpus`; `createImageEvaluators`
// construye los dos StrategyEvaluator RB+image/FS+image que la CLI de
// comparación (apps/ingestion) usa junto a RULE_BASED_EVALUATOR/
// PROBABILISTIC_EVALUATOR para las 4 filas del reporte.
export type { ImageRefPair } from './evaluation/dedup-corpus-images.js';
export { IMAGE_REFS, withCorpusImages } from './evaluation/dedup-corpus-images.js';
export type { ImageEvaluators, ImageStrategyEvaluator } from './evaluation/image-evaluators.js';
export { createImageEvaluators } from './evaluation/image-evaluators.js';

// Señal auxiliar de imagen (ROADMAP 2.3, decisión 093/094): comparador de
// hashes perceptuales ya calculados, positivo-solo, y el decorador que la
// añade a una DedupStrategy existente sin alterar su cálculo estructurado.
// Deliberadamente NO exportados: los combinadores concretos
// (`ruleBasedImageCombiner`/`probabilisticImageCombiner`) y sus pesos/m/u —
// internos a `strategies/image/`, usados solo dentro de este paquete por
// `evaluation/image-evaluators.ts` (Phase 4), mismo precedente que
// WEIGHTS/T_HIGH/T_LOW de rule-based (barrel.test.ts).
export type {
  ImageHashEntry,
  ImageComparison,
  ImageLevel,
  ImageReason,
} from './strategies/image/compare.js';
export { compareImageHashes } from './strategies/image/compare.js';
export { hammingDistance64 } from './strategies/image/hamming.js';
export { formatImageDetail, parseImageDetail } from './strategies/image/detail.js';
export type { ImageHashLookup } from './strategies/image/lookup.js';
export { createImageHashLookup } from './strategies/image/lookup.js';
export { withImageSignal } from './strategies/image/with-image-signal.js';
export { classifyRuleBasedWithImage } from './strategies/image/classify.js';
// Umbral calibrado (ROADMAP 2.3, Phase 3, decisión 097): T=10, derivado
// SOLO del set de calibración (spec "Threshold T Traceable Only to the
// Calibration Set") — nunca ajustado sobre las 24 parejas del corpus de
// evaluación. Diferido de Phase 3 a Phase 4 (tarea 4.12): antes de que
// existiera `createImageEvaluators`, ningún consumidor fuera del paquete lo
// necesitaba.
export { IMAGE_HAMMING_THRESHOLD } from './strategies/image/parameters.js';

// Limitación de tasa (ROADMAP 1.15, security-hardening): política pura,
// reutilizada por el limitador en memoria de `apps/web/src/proxy.ts` (D1b,
// PR2) y por la resolución de identidad de cliente del registro de
// cobertura (PR2). Cero DB, cero red — mismo criterio de "solo lo que
// cruza la frontera" que el resto de este barril.
export { evaluateFixedWindow } from './rate-limit/fixed-window.js';
export type {
  FixedWindowParams,
  FixedWindowResult,
  FixedWindowState,
} from './rate-limit/fixed-window.js';
export { parseTrustedClientIp, UNKNOWN_CLIENT_IDENTITY } from './rate-limit/client-ip.js';

// Política de refresco y retención (ROADMAP 2.5, refresh-retention-policy,
// decisión 103): cadencia por demanda y planificador de mantenimiento de
// zonas. Puro — recibe días/segundos ya resueltos por el reloj de Postgres.
export {
  classifyZoneCadence,
  isRefreshDue,
  LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS,
  LISTING_TOMBSTONE_BATCH_SIZE,
  MONTHLY_MAX_DEMAND_AGE_DAYS,
  MONTHLY_REFRESH_INTERVAL_DAYS,
  PRESENCE_BATCH_SIZE,
  PRESENCE_MAX_CHECK_ATTEMPTS,
  PRESENCE_RETRY_BACKOFF_DAYS,
  PURGE_DEMAND_AGE_DAYS,
  SIGNAL_PURGE_MAX_ROWS_PER_TICK,
  SIGNAL_RETENTION_DAYS,
  WEEKLY_MAX_DEMAND_AGE_DAYS,
  WEEKLY_REFRESH_INTERVAL_DAYS,
} from './retention/policy.js';
export type { ZoneCadence } from './retention/policy.js';
export { MAX_ZONE_PURGES_PER_PASS, planZoneMaintenance } from './retention/zone-maintenance.js';
export type { RefreshTarget, ZoneLifecycleSnapshot, ZoneMaintenancePlan } from './retention/zone-maintenance.js';
// Verificación de presencia por `adIds` (S3, decisión 105): capacidad separada
// de `PropertySource` y planificación pura de lotes.
export type {
  ListingPresenceVerifier,
  PresenceBatch,
  PresenceVerdict,
} from './contracts/listing-presence-verifier.js';
export { partitionPresenceVerdicts, planPresenceBatches } from './retention/presence-batches.js';
export type { PartitionedPresence, PresenceCandidate } from './retention/presence-batches.js';
// Histórico de precios de la ficha (D.10, decisión 178): derivación pura.
export { derivePriceHistory, priceChangePercentTenths } from './price-history/derive-price-history.js';
export type {
  PriceHistory,
  PriceObservation,
  PricePoint,
  PriceSeries,
} from './price-history/derive-price-history.js';

// Comparación de los anuncios de origen de la ficha (D.12, decisión 180).
export { compareSourceListings } from './source-comparison/compare-source-listings.js';
export type {
  SourceComparison,
  SourceListingSnapshot,
} from './source-comparison/compare-source-listings.js';

// Tope de reintentos de un coverage_job, compartido entre ingesta y web (D.13b, decisión 184).
export { COVERAGE_JOB_MAX_ATTEMPTS, hasRetriesLeft } from './coverage-jobs/job-retry.js';

export const CORE_VERSION = '0.0.1';

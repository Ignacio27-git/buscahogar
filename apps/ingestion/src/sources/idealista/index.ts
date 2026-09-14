// Paso 1.6 — barril del adaptador de Idealista. Reexports explícitos y
// nombrados, nunca `export *`: mismo estilo que packages/core/src/index.ts
// (solo lectura, referencia de estilo), el paquete del que dependen el
// resto de workspaces del monorepo.
export { createIdealistaSource, isSweepComplete } from './idealista-source.js';
export type { IdealistaSource, IdealistaSourceOptions, SweepDiagnostics } from './idealista-source.js';

export { IdealistaListingNormalizer, NormalizationError } from './normalizer.js';

export { IDEALISTA_FILTERS } from './filters.js';
export type { IdealistaFilter } from './filters.js';

export { rawElementSchema } from './raw-element.schema.js';
export type { IdealistaElement } from './raw-element.schema.js';

export { MAX_TRUSTED_TOTAL_PAGES, rawEnvelopeSchema } from './raw-envelope.schema.js';
export type { RawEnvelope } from './raw-envelope.schema.js';

export { describeMapping, mapPropertyType } from './property-type-map.js';
export type { PropertyTypeMapping } from './property-type-map.js';

export { decodeCursor, encodeCursor } from './cursor.js';
export type { SweepPosition } from './cursor.js';

export { createSweepBudget } from './budget.js';
export type { BudgetSnapshot, RequestKind, SweepBudget } from './budget.js';

export { planNext } from './sweep-planner.js';
export type { PlanResult } from './sweep-planner.js';

export {
  IdealistaSweepError,
  InvalidCursorError,
  SweepAreaMismatchError,
  SweepBudgetExhaustedError,
  SweepTransportError,
  UntrustworthyEnvelopeError,
} from './errors.js';

export { buildSearchFields, toFormData } from './search-request.js';
export type { SearchField } from './search-request.js';

export { scrubCredentials } from './scrub-credentials.js';
export type { ScrubbableCredentials } from './scrub-credentials.js';

export { createHttpSearchPort, createHttpTokenPort } from './http-client.js';
export type { HttpTokenCredentials } from './http-client.js';

export type {
  Headers,
  IdealistaSearchPort,
  IdealistaTokenPort,
  SweepEvent,
  SweepLogger,
  TransportOutcome,
} from './ports.js';

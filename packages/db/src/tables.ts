// Barrel de todas las tablas y el enum del esquema. Deliberadamente vive
// fuera de `./src/schema/*.ts` (el glob que usa `drizzle.config.ts`): si este
// fichero estuviera dentro del glob, drizzle-kit importaría cada tabla dos
// veces y podría duplicarla en la migración generada (docs/DECISIONS.md,
// decisión de módulos D1 del diseño).
export { coverageJobStatus } from './schema/enums.js';
export { coverageClientQuota } from './schema/coverage-client-quota.js';
export { coverageJobs } from './schema/coverage-jobs.js';
export { dailyRequestBudget } from './schema/daily-request-budget.js';
export { dedupPairEvidence } from './schema/dedup-pair-evidence.js';
export { dedupRuns } from './schema/dedup-runs.js';
export { features } from './schema/features.js';
export { listingFeatures } from './schema/listing-features.js';
export { listingPresenceChecks } from './schema/listing-presence-checks.js';
export { listingVersions } from './schema/listing-versions.js';
export { listings } from './schema/listings.js';
export { locations } from './schema/locations.js';
export { monthlyRequestBudget } from './schema/monthly-request-budget.js';
export { properties } from './schema/properties.js';
export { propertyListings } from './schema/property-listings.js';
export { sources } from './schema/sources.js';
export { zoneQuerySignals } from './schema/zone-query-signals.js';
export { zones } from './schema/zones.js';

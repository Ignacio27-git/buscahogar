// Barrel de todas las tablas y el enum del esquema. Deliberadamente vive
// fuera de `./src/schema/*.ts` (el glob que usa `drizzle.config.ts`): si este
// fichero estuviera dentro del glob, drizzle-kit importaría cada tabla dos
// veces y podría duplicarla en la migración generada (docs/DECISIONS.md,
// decisión de módulos D1 del diseño).
export { coverageJobStatus } from './schema/enums';
export { coverageJobs } from './schema/coverage-jobs';
export { features } from './schema/features';
export { listingFeatures } from './schema/listing-features';
export { listingVersions } from './schema/listing-versions';
export { listings } from './schema/listings';
export { locations } from './schema/locations';
export { properties } from './schema/properties';
export { propertyListings } from './schema/property-listings';
export { sources } from './schema/sources';
export { zones } from './schema/zones';

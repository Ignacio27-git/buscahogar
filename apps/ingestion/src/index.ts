// Agregador inmobiliario — worker de ingesta
//
// Responsabilidades:
// - Barrido de APIs de fuentes (Idealista, etc.)
// - Normalización a esquema común
// - Persistencia en listings
// - Deduplicación
// - Consolidación de viviendas canónicas
// - Refresco periódico y retención

import { fileURLToPath } from 'node:url';

// Paso 1.6 — adaptador de la primera fuente (Idealista) y su normalizador.
// Barril interno al workspace (no un paquete consumido por otros), así que
// se reexporta con `export *`, igual que packages/db/src/index.ts.
export * from './sources/idealista/index.js';

// Paso 1.7 — barrido de zona y persistencia de listings. Reexports
// explícitos y nombrados, nunca `export *` (mismo estilo que el barril de
// idealista, src/sources/idealista/index.ts): dos ficheros distintos
// declaran un tipo `SweepOutcomeKind` con la misma forma
// (sweep-runner.ts, report.ts) y `export *` los haría colisionar en
// silencio, así que el de report.ts se reexporta con un alias.
//
// `db-env-guard.ts` queda deliberadamente fuera de este barril: es
// infraestructura de apoyo a `test/db/setup-db-env.ts` (diseño D2), no
// parte de la API de dominio del barrido — mismo criterio por el que
// `test/setup-no-network.ts` tampoco se exporta.
export { SweepOptionsError, parseSweepArgs } from './sweep/options.js';
export type { SweepOptions } from './sweep/options.js';

export { areaFingerprint, buildArea } from './sweep/area.js';

export { LISTING_FIELD_POLICY, VERSION_COLUMN_FIELDS } from './sweep/listing-field-policy.js';
export type { FieldPolicy, VersionColumns } from './sweep/listing-field-policy.js';

export { equalVersionColumns, projectToVersionColumns } from './sweep/version-columns.js';

export { decodeJobCursor, encodeJobCursor } from './sweep/job-cursor.js';

export { buildReport } from './sweep/report.js';
export type { SweepOutcomeKind as SweepReportOutcomeKind, SweepReport, SweepReportInput } from './sweep/report.js';

export type {
  ClaimedJob,
  JobOutcome,
  PersistPageInput,
  PersistPageItem,
  PersistPageOutcome,
  SweepStore,
} from './sweep/store.js';

export { runSweep } from './sweep/sweep-runner.js';
export type { SweepOutcomeKind, SweepRunResult, SweepRunnerOptions } from './sweep/sweep-runner.js';

export { createListingWriter } from './sweep/listing-writer.js';
export type { ListingWriter } from './sweep/listing-writer.js';

export { createCoverageStore, JobAlreadyClaimedError } from './sweep/coverage-store.js';
export type { CoverageStore } from './sweep/coverage-store.js';

export {
  resolveSourceUuid,
  resolveZoneByIneCode,
  UnknownSourceError,
  UnknownZoneError,
} from './sweep/reference-store.js';

export const INGESTION_VERSION = '0.0.1';

// ROADMAP 1.13 Unit C (diseño CR-1, arbitraje vinculante) — el placeholder
// que este `main()` llevaba ("Esperando implementación en los pasos
// posteriores") se sustituye por un banner de una línea que nombra el
// entrypoint REAL: `scripts/coverage-worker.ts`. Este fichero sigue siendo
// el barril del paquete (`export *`/reexports nombrados arriba) — nunca
// gana una lectura de `process.env` ni un `pg.Pool` propios, porque eso
// haría `import '@buscahogar/ingestion'` side-effectful y rompería la regla
// que `scripts/sweep-zone.ts` fijó a propósito: los composition roots viven
// en `scripts/` y son los únicos lectores de `process.env`.
export function main(): void {
  console.log(`Ingestion worker v${INGESTION_VERSION}`);
  console.log('Entrypoint real: pnpm --filter @buscahogar/ingestion run worker (scripts/coverage-worker.ts).');
}

// Se ejecuta solo como entrypoint (pnpm dev / start), no al importarlo desde los
// tests. Se usa fileURLToPath en lugar de import.meta.filename porque este último
// no existe antes de Node 20.11 y devolvería undefined en silencio.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

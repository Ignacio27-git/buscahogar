// Enumeración de estados de un `coverage_job` (trabajo de barrido de una
// zona contra una fuente).
//
// Es el único enum de tipo `pgEnum` de todo el esquema: el resto de columnas
// de estado cerrado usan `text` + CHECK (ver `sources.kind`, `zones.state`,
// `listings.status`, `listing_versions.operation` en la Fase 2). Ver
// docs/DECISIONS.md para el porqué de este reparto.
//
// IMPORTANTE: debe exportarse siempre. Un `pgEnum` no exportado puede quedar
// fuera de la migración que genera `drizzle-kit generate` sin ningún aviso.
import { pgEnum } from 'drizzle-orm/pg-core';

export const coverageJobStatus = pgEnum('coverage_job_status', [
  'pending',
  'running',
  'done',
  'failed',
]);

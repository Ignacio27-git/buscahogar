// Cabecera de una ejecución de reproceso de deduplicación: identidad de la
// estrategia activa, los umbrales de bloqueo con los que corrió, y los
// conteos agregados que hacen su reporte reconstruible sin releer entera
// `dedup_pair_evidence`/`properties` (ROADMAP 1.10). Nunca se borra: es un
// registro de apéndice con un ciclo de vida distinto al de
// `properties`/`property_listings`, que sí se reconstruyen por completo en
// cada corrida (docs/DECISIONS.md, decisión 055).
import { bigint, doublePrecision, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id } from './columns.js';

export const dedupRuns = pgTable('dedup_runs', {
  id: id(),
  // Identidad de la estrategia activa en esta corrida. No se normaliza a
  // una tabla de estrategias propia: poder comparar corridas de distintas
  // versiones lado a lado es la razón de ser de esta tabla (docs/DECISIONS.md,
  // decisión 055).
  strategyName: text('strategy_name').notNull(),
  strategyVersion: text('strategy_version').notNull(),
  // Los tres umbrales de bloqueo son argumentos de la CLI, no una constante
  // del código: sin guardarlos aquí la evidencia persistida sería
  // ininterpretable más tarde, y dos corridas de la MISMA versión de
  // estrategia con distinto `--radius` producirían conjuntos de candidatos
  // distintos que el chequeo de conflicto de `buildPropertyGroups()` no
  // podría distinguir entre sí (ver el índice por `runId` en
  // `dedup-pair-evidence.ts`).
  radiusMeters: doublePrecision('radius_meters').notNull(),
  // `mode: 'number'` (mismo motivo que `listing_versions.priceCents`,
  // CHK-BIGINT-MODE): una banda de precio en céntimos cabe sobradamente en
  // un entero seguro de JS.
  priceBandCents: bigint('price_band_cents', { mode: 'number' }).notNull(),
  surfaceToleranceM2: integer('surface_tolerance_m2').notNull(),
  // Conteos agregados de la corrida, escritos una sola vez al terminar:
  // alimentan el reporte de la CLI de reproceso (REPRO-2) sin tener que
  // volver a agregar sobre `dedup_pair_evidence`/`properties` después.
  listingsConsidered: integer('listings_considered').notNull(),
  candidatePairs: integer('candidate_pairs').notNull(),
  acceptPairs: integer('accept_pairs').notNull(),
  undecidedPairs: integer('undecided_pairs').notNull(),
  rejectPairs: integer('reject_pairs').notNull(),
  propertiesCreated: integer('properties_created').notNull(),
  refusedComponents: integer('refused_components').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
});

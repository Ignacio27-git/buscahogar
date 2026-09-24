// Evidencia de deduplicación con alcance por corrida: cada fila persiste el
// resultado COMPLETO de puntuar un par candidato — accept, undecided o
// reject por igual (CLAUDE.md, "Deduplicación") — con su `runId` propio, de
// forma que el chequeo de conflicto de `buildPropertyGroups()` solo puede
// leer las filas de la corrida actual y nunca un `reject` residual de una
// corrida o versión de estrategia anterior (docs/DECISIONS.md, decisión
// 055). `property_listings` no puede alojar esta evidencia: exige a lo
// sumo una fila por `listingId` y `propertyId` NOT NULL, y un par
// rechazado no tiene ninguno de los dos.
import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SignalBreakdown } from '../types.js';
import { id } from './columns.js';
import { dedupRuns } from './dedup-runs.js';
import { listingVersions } from './listing-versions.js';
import { listings } from './listings.js';

export const dedupPairEvidence = pgTable(
  'dedup_pair_evidence',
  {
    id: id(),
    runId: uuid('run_id')
      .notNull()
      .references(() => dedupRuns.id, { onDelete: 'cascade' }),
    listingAId: uuid('listing_a_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    listingBId: uuid('listing_b_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    signals: jsonb('signals').$type<SignalBreakdown>().notNull(),
    band: text('band').notNull(),
    // Qué instantánea de cada anuncio se puntuó exactamente; nulable por el
    // mismo motivo que `property_listings.scoredListingVersionId`
    // (`property-listings.ts:45-47`, decisión 018): perder el rastro de la
    // versión concreta no debe invalidar la evidencia ya persistida.
    scoredListingVersionIdA: uuid('scored_listing_version_id_a').references(
      () => listingVersions.id,
      { onDelete: 'set null' }
    ),
    scoredListingVersionIdB: uuid('scored_listing_version_id_b').references(
      () => listingVersions.id,
      { onDelete: 'set null' }
    ),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'dedup_pair_evidence_band_check',
      sql`${table.band} in ('accept', 'undecided', 'reject')`
    ),
    // Hace estructural la orientación canónica que ya impone el bloqueo
    // (`blocking.ts:97`, `lt(a.id, b.id)`): el chequeo de conflicto nunca
    // necesita probar los dos órdenes de un mismo par.
    check(
      'dedup_pair_evidence_listing_order_check',
      sql`${table.listingAId} < ${table.listingBId}`
    ),
    uniqueIndex('dedup_pair_evidence_run_listings_idx').on(
      table.runId,
      table.listingAId,
      table.listingBId
    ),
    // La consulta que hace el chequeo de conflicto de `buildPropertyGroups()`
    // (D1 del diseño): `run_id = :actual AND band = 'reject'`.
    index('dedup_pair_evidence_run_band_idx').on(table.runId, table.band),
    // Mismo precedente que `property_listings_signals_idx`
    // (`property-listings.ts:54`): `jsonb_ops` sirve el operador `?`, por si
    // hace falta filtrar por una señal concreta sin escanear la tabla.
    index('dedup_pair_evidence_signals_idx').using('gin', table.signals.op('jsonb_ops')),
  ]
);

// Paso 1.7 — puerto SweepStore (diseño D1): tipos únicamente, cero imports
// de drizzle o pg. El driver del barrido (sweep-runner.ts) depende de este
// puerto, no de Database — así su terminación, propagación del tope y
// enrutado de errores son demostrables sin red ni base de datos. La fase 2
// (fuera de este lote) implementa el puerto contra PostgreSQL; aquí solo se
// fija la forma.
//
// Sin test dedicado (tarea 1.1): son tipos puros, sin comportamiento propio
// que ejecutar.
import type { Listing } from '@buscahogar/core';

import type { IdealistaElement } from '../sources/idealista/raw-element.schema.js';

// La unidad de persistencia es un PAR {raw, listing}, no un Listing suelto:
// listing_versions.raw debe recibir el IdealistaElement sin tocar (diseño
// D1) — un puerto que solo aceptara Listing destruiría en silencio los
// bytes ya pagados que rawElementSchema conserva como looseObject (1.6 D2).
export interface PersistPageItem {
  readonly raw: IdealistaElement;
  readonly listing: Listing;
}

export interface PersistPageInput {
  readonly jobId: string;
  readonly sourceUuid: string;
  readonly items: readonly PersistPageItem[];
  // undefined ⇒ el barrido se ha completado con esta página.
  readonly nextCursor: string | undefined;
  readonly fingerprint: string;
}

export interface PersistPageOutcome {
  readonly inserted: number;
  readonly versioned: number;
  readonly unchanged: number;
}

// Operación de un job de cobertura (decisión 250): venta y alquiler de una zona
// son jobs independientes, cada uno con su cursor.
export type JobOperation = 'sale' | 'rent';

// ROADMAP 3.3 (decisión 253, D11) — qué hace el reclamo con `coverage_jobs.presweep_requested_at`, la marca de
// trabajo parcial del presweep: 'mark' la fija (reclamo del carril batch del presweep); 'clear' la limpia (el
// worker reclama un job promovido a demanda). Sin opción el reclamo no la toca (barrido manual, refresco).
export interface ClaimOptions {
  readonly presweep?: 'mark' | 'clear';
}

// Trabajo ya reclamado (CAS) por coverage-store.claimJob, ANTES de invocar
// el driver del barrido (ver sweep-runner.ts). `cursor` ya viene decodificado
// del envelope versionado y con la huella de área verificada (job-cursor.ts)
// — es la posición desnuda del adaptador de Idealista ("homes:2"), lista
// para pasarse tal cual a `source.fetchArea`. `undefined` ⇒ arranque limpio.
export interface ClaimedJob {
  readonly id: string;
  readonly cursor?: string;
}

// Enrutado exacto de la tabla D6 del diseño. Cada variante lleva solo los
// datos que esa fila necesita — un `finishJob(id, {kind:'budget-exhausted'})`
// no compila sin su resumeCursor, así que el enrutado incompleto es un error
// de tipos, no un olvido en tiempo de ejecución.
export type JobOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'budget-exhausted'; readonly resumeCursor: string }
  | { readonly kind: 'transport-failed'; readonly resumeCursor: string; readonly error: string }
  | { readonly kind: 'untrustworthy-envelope'; readonly resumeCursor: string; readonly error: string }
  | { readonly kind: 'invalid-cursor'; readonly error: string };

export interface SweepStore {
  // UNA transacción por página (diseño D3): upserts + versiones + avance del
  // cursor de coverage_jobs, todo dentro de la misma transacción.
  persistPage(input: PersistPageInput): Promise<PersistPageOutcome>;
  // CAS: UPDATE … WHERE status='pending' RETURNING * (diseño D6). Cero filas
  // devueltas ⇒ ya reclamado por otro proceso. sweep-runner.ts NO llama a
  // este método — lo hace el compositor (scripts/sweep-zone.ts, fase 4)
  // antes de invocar el driver, precisamente para que un reclamo fallido no
  // llegue nunca a `source.fetchArea` (COVERAGE-3a).
  claimJob(
    zoneId: string,
    sourceId: string,
    operation: JobOperation,
    fingerprint: string,
    options?: ClaimOptions
  ): Promise<ClaimedJob>;
  finishJob(jobId: string, outcome: JobOutcome): Promise<void>;
}

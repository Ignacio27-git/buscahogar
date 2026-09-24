// Paso 1.7 — sweep-runner.ts (diseño D1, "Data flow"): el bucle del
// barrido, dependiente del PUERTO SweepStore, nunca de Database — su
// terminación, la propagación del tope y el enrutado de errores son
// demostrables sin red ni base de datos (la fase 2, fuera de este lote,
// implementa el puerto).
//
// El reclamo del trabajo (coverage-store.claimJob) NO ocurre aquí: lo hace
// el compositor (scripts/sweep-zone.ts, fase 4) ANTES de invocar esta
// función, pasando el `ClaimedJob` ya resuelto. Esto es lo que completa
// ESTRUCTURALMENTE la garantía de "cero peticiones" de COVERAGE-3a — si el
// reclamo falla, este bucle ni siquiera llega a invocarse.
//
// Sin ban de bucles (diseño D10): este fichero no emite ninguna petición
// por sí mismo — llama a `source.fetchArea`, cuyo propio tope duro vive en
// budget.ts (1.6) — así que `eslint.config.mjs` no lo incluye en su glob.
import type { AreaQuery, Listing, ListingNormalizer, PropertySource, SourcePage } from '@buscahogar/core';

import {
  InvalidCursorError,
  SweepBudgetExhaustedError,
  SweepTransportError,
  UntrustworthyEnvelopeError,
} from '../sources/idealista/errors.js';
import { isSweepComplete } from '../sources/idealista/idealista-source.js';
import { NormalizationError } from '../sources/idealista/normalizer.js';
import type { IdealistaElement } from '../sources/idealista/raw-element.schema.js';
import type { ClaimedJob, PersistPageItem, SweepStore } from './store.js';

export interface SweepRunnerOptions {
  readonly source: PropertySource<IdealistaElement>;
  readonly normalizer: ListingNormalizer<IdealistaElement>;
  readonly store: SweepStore;
  readonly area: AreaQuery;
  // Ya reclamado por el compositor — ver nota de fichero.
  readonly job: ClaimedJob;
  // sources.key='idealista' → uuid, resuelto una vez por barrido
  // (reference-store.ts, fase 2, diseño D5).
  readonly sourceUuid: string;
  // areaFingerprint(area) — viaja en cada persistPage para reescribir el
  // envelope de coverage_jobs.cursor con la misma huella verificada al
  // reclamar (diseño D6).
  readonly fingerprint: string;
}

export type SweepOutcomeKind = 'completed' | 'budget-exhausted' | 'failed';

export interface SweepRunResult {
  readonly outcome: SweepOutcomeKind;
  readonly inserted: number;
  readonly versioned: number;
  readonly unchanged: number;
  readonly rejectedCount: number;
  readonly resumeCursor?: string;
  readonly error?: string;
}

// Normaliza un elemento ya filtrado por rawElementSchema dentro del
// adaptador; NormalizationError se cuenta y se salta, nunca aborta la
// página (CLI-5, confirma P3). Cualquier otra excepción no se enmascara.
function normalizeItem(
  normalizer: ListingNormalizer<IdealistaElement>,
  raw: IdealistaElement
): { readonly item?: PersistPageItem; readonly rejected: boolean } {
  try {
    const listing: Listing = normalizer.normalize(raw);
    return { item: { raw, listing }, rejected: false };
  } catch (error) {
    if (error instanceof NormalizationError) {
      return { rejected: true };
    }
    throw error;
  }
}

function normalizePage(
  normalizer: ListingNormalizer<IdealistaElement>,
  page: SourcePage<IdealistaElement>
): { readonly items: readonly PersistPageItem[]; readonly rejectedCount: number } {
  const items: PersistPageItem[] = [];
  let rejectedCount = 0;
  page.items.forEach((raw) => {
    const result = normalizeItem(normalizer, raw);
    if (result.item !== undefined) {
      items.push(result.item);
    }
    if (result.rejected) {
      rejectedCount += 1;
    }
  });
  return { items, rejectedCount };
}

export async function runSweep(options: SweepRunnerOptions): Promise<SweepRunResult> {
  const { source, normalizer, store, area, job, sourceUuid, fingerprint } = options;

  let cursor = job.cursor;
  let inserted = 0;
  let versioned = 0;
  let unchanged = 0;
  let rejectedCount = 0;

  for (;;) {
    let page: SourcePage<IdealistaElement>;
    try {
      page = await source.fetchArea(area, cursor);
    } catch (error) {
      // Enrutado exacto de la tabla D6: cada subclase de 1.6 lleva su
      // propio resumeCursor (o su ausencia, para InvalidCursorError) y su
      // propia llamada a finishJob. Ninguna otra clase se captura aquí —
      // un error inesperado debe seguir reventando, nunca enmascararse
      // como un resultado "failed" silencioso.
      if (error instanceof SweepBudgetExhaustedError) {
        await store.finishJob(job.id, { kind: 'budget-exhausted', resumeCursor: error.resumeCursor });
        return { outcome: 'budget-exhausted', inserted, versioned, unchanged, rejectedCount, resumeCursor: error.resumeCursor };
      }
      if (error instanceof SweepTransportError) {
        await store.finishJob(job.id, {
          kind: 'transport-failed',
          resumeCursor: error.resumeCursor,
          error: error.observation,
        });
        return {
          outcome: 'failed',
          inserted,
          versioned,
          unchanged,
          rejectedCount,
          resumeCursor: error.resumeCursor,
          error: error.observation,
        };
      }
      if (error instanceof UntrustworthyEnvelopeError) {
        const message = `campo "${error.field}" no supera la validación del envelope.`;
        await store.finishJob(job.id, {
          kind: 'untrustworthy-envelope',
          resumeCursor: error.resumeCursor,
          error: message,
        });
        return {
          outcome: 'failed',
          inserted,
          versioned,
          unchanged,
          rejectedCount,
          resumeCursor: error.resumeCursor,
          error: message,
        };
      }
      if (error instanceof InvalidCursorError) {
        // D6: el cursor se mantiene, NUNCA se limpia — reanudar desde cero
        // volvería a gastar cuota ya pagada.
        await store.finishJob(job.id, { kind: 'invalid-cursor', error: error.reason });
        return { outcome: 'failed', inserted, versioned, unchanged, rejectedCount, error: error.reason };
      }
      throw error;
    }

    const { items, rejectedCount: pageRejected } = normalizePage(normalizer, page);
    rejectedCount += pageRejected;

    // UNA transacción por página, cursor incluido (diseño D3) — vive dentro
    // de la implementación del puerto (fase 2), no aquí.
    const outcome = await store.persistPage({
      jobId: job.id,
      sourceUuid,
      items,
      nextCursor: page.nextCursor,
      fingerprint,
    });
    inserted += outcome.inserted;
    versioned += outcome.versioned;
    unchanged += outcome.unchanged;

    // NUNCA items.length (1.6 A5 / diseño D7): items vacíos con nextCursor
    // presente no es fin de barrido.
    if (isSweepComplete(page)) {
      await store.finishJob(job.id, { kind: 'completed' });
      return { outcome: 'completed', inserted, versioned, unchanged, rejectedCount };
    }

    cursor = page.nextCursor;
  }
}

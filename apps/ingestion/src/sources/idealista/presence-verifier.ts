// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — implementación de
// `ListingPresenceVerifier` (packages/core) para Idealista. Capacidad SEPARADA
// de `createIdealistaSource`: barrer una zona y comprobar anuncios concretos son
// cosas distintas.
//
// EXACTAMENTE UNA petición de búsqueda por `verifyBatch` — sin bucles (mismo
// criterio que idealista-source.ts, eslint.config.mjs) — y el presupuesto se
// gasta ANTES de enviar (`budget.spend`), así que una petición fallida cuenta
// igual que una exitosa. El tope duro `maxRequests` lo impone el propio
// presupuesto: un lote más allá del tope no sale y queda ambiguo.
//
// `verifyBatch` NO lanza: cualquier fallo (token, transporte, envelope, tope,
// filtro desconocido, lote demasiado grande) devuelve todos los ids como
// `ambiguous` y nada cambia de estado. La clasificación es pura
// (presence-classify.ts). El token se adquiere una vez y se cachea.
import type { ListingPresenceVerifier, PresenceBatch, PresenceVerdict } from '@buscahogar/core';
import { PRESENCE_BATCH_SIZE } from '@buscahogar/core';

import { createSweepBudget } from './budget.js';
import type { BudgetSnapshot } from './budget.js';
import { IDEALISTA_FILTERS } from './filters.js';
import type { IdealistaSearchPort, IdealistaTokenPort } from './ports.js';
import { classifyPresence } from './presence-classify.js';
import { DELISTED_OMISSION_CONFIRMED } from './presence-evidence.js';
import { buildPresenceFields } from './presence-request.js';
import { scrubCredentials } from './scrub-credentials.js';

export interface IdealistaPresenceVerifierOptions {
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
  // Margen que se suma al radio de la zona en la petición (metros).
  readonly radiusMarginM: number;
  // Tope duro de peticiones de búsqueda de ESTA instancia (por tick).
  readonly maxRequests: number;
  // Solo para tests: por defecto, la constante commiteada atada a la fixture de
  // la sonda (presence-evidence.ts).
  readonly omissionConfirmed?: boolean;
  readonly log?: (line: string) => void;
}

export interface IdealistaPresenceVerifier extends ListingPresenceVerifier {
  // Peticiones realmente gastadas por esta instancia (token y búsqueda), para
  // reconciliar el ledger diario con lo que de verdad salió.
  budgetSnapshot(): BudgetSnapshot;
}

function isIdealistaFilter(value: string): boolean {
  return (IDEALISTA_FILTERS as readonly string[]).includes(value);
}

function allAmbiguous(ids: readonly string[]): ReadonlyMap<string, PresenceVerdict> {
  return new Map(ids.map((id): [string, PresenceVerdict] => [id, 'ambiguous']));
}

export function createIdealistaPresenceVerifier(options: IdealistaPresenceVerifierOptions): IdealistaPresenceVerifier {
  const budget = createSweepBudget(options.maxRequests);
  const omissionConfirmed = options.omissionConfirmed ?? DELISTED_OMISSION_CONFIRMED;
  let cachedToken: string | undefined;

  function log(line: string): void {
    options.log?.(`coverage-worker: verificación de presencia — ${line}`);
  }

  async function ensureToken(): Promise<string> {
    if (cachedToken !== undefined) {
      return cachedToken;
    }
    // Contar SIEMPRE antes de enviar (mismo principio que idealista-source.ts).
    budget.spend('token', { resumeCursor: '' });
    const outcome = await options.tokenPort.acquire();
    if (outcome.kind !== 'ok') {
      throw new Error(
        outcome.kind === 'network-error'
          ? 'token: error de red'
          : `token: respuesta ${outcome.kind} (estado ${String(outcome.status)})`
      );
    }
    const body = outcome.body as { access_token?: unknown } | null;
    if (typeof body?.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('token: la respuesta no contiene un access_token no vacío');
    }
    cachedToken = body.access_token;
    return cachedToken;
  }

  return {
    async verifyBatch(batch: PresenceBatch): Promise<ReadonlyMap<string, PresenceVerdict>> {
      const ids = [...batch.externalIds];
      if (ids.length === 0) {
        return new Map();
      }
      if (ids.length > PRESENCE_BATCH_SIZE) {
        log(`lote de ${String(ids.length)} ids descartado (máximo ${String(PRESENCE_BATCH_SIZE)}), sin petición.`);
        return allAmbiguous(ids);
      }
      if (!isIdealistaFilter(batch.groupKey)) {
        log(`filtro "${batch.groupKey}" desconocido, sin petición.`);
        return allAmbiguous(ids);
      }

      try {
        const token = await ensureToken();
        budget.spend('search', { resumeCursor: '' });
        const outcome = await options.searchPort.search(buildPresenceFields(batch, options.radiusMarginM), token);
        if (outcome.kind !== 'ok') {
          log(
            outcome.kind === 'network-error'
              ? 'la petición falló por error de red; lote ambiguo.'
              : `la petición respondió ${outcome.kind} (estado ${String(outcome.status)}); lote ambiguo.`
          );
        }
        return classifyPresence(ids, outcome, omissionConfirmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`${scrubCredentials(message, { apiKey: '', apiSecret: '', accessToken: cachedToken })}; lote ambiguo.`);
        return allAmbiguous(ids);
      }
    },

    budgetSnapshot(): BudgetSnapshot {
      return budget.snapshot();
    },
  };
}

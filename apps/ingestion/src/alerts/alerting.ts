// ROADMAP 3.4 (decisión 259, D17; R7.1-R7.6) — orquestación de los avisos operativos por Telegram. Compone las
// comprobaciones y la selección PURAS de `@buscahogar/core` con tres dependencias inyectadas (almacén duradero
// de deduplicación, fuentes de estado, notificador), así que se prueba sin base de datos ni red.
//
// Un paso (`alertStep`) por tick que no lanzó, con el presupuesto de salida del tick COMPARTIDO con el latido:
//   1. foto del estado -> candidatos (`evaluateAlertChecks`);
//   2. enfriamiento contra el último envío PERSISTIDO -> mensajes (`selectAlertsToSend`): como mucho
//      `maxPerTick` (3), el exceso plegado en UN resumen "+N más", y siempre `reserveSlots` plazas libres para el
//      latido (el dead-man's-switch no puede quedarse sin plaza por culpa de una ráfaga de avisos);
//   3. envío SECUENCIAL (cada mensaje toma una plaza; la separación de >= 1 s por chat la impone el notificador);
//      solo lo realmente enviado se registra. El primer fallo corta el tick y activa una espera
//      (`failureBackoffMs`) antes de volver a intentarlo: un canal caído no se martillea.
//
// Una avería al LEER el estado se propaga (el driver aísla el paso con `runIsolatedStep`); un fallo al registrar
// un envío se registra y el paso continúa. Sin token/chat (`createDisabledAlerting`) no hay lectura, ni envío,
// ni gasto de plazas: cero intentos de red (R7.1).
import { evaluateAlertChecks, selectAlertsToSend } from '@buscahogar/core';
import type { AlertCheckConfig, AlertQuotaState } from '@buscahogar/core';

import type { JsonLogger } from '../ops/json-logger.js';
import type { OutboundBudget } from '../ops/outbound-budget.js';
import type { StaleReclaimEvent } from '../sweep/coverage-worker.js';
import type { TelegramNotifier } from './telegram-notifier.js';

// Máximo de mensajes de Telegram por tick (R7.4).
export const MAX_ALERT_MESSAGES_PER_TICK = 3;
// Plazas del presupuesto de salida que los avisos dejan al latido.
export const HEARTBEAT_RESERVED_SLOTS = 1;
// Espera tras un envío fallido antes de volver a intentar (no se martillea un canal caído).
export const ALERT_FAILURE_BACKOFF_MS = 60_000;
// Antigüedad a partir de la cual se purgan las filas del registro de deduplicación.
export const ALERT_LOG_RETENTION_MS = 90 * 24 * 3_600_000;

export interface AlertingStore {
  readTimes(keys: readonly string[]): Promise<ReadonlyMap<string, Date>>;
  record(key: string, at: Date): Promise<void>;
  purge(olderThan: Date): Promise<number>;
}

export interface AlertingSources {
  // Jobs `failed` cuyo fin cae dentro de los últimos `windowMs`.
  countFailedJobs(windowMs: number): Promise<number>;
  // Cuota del mes en curso (o la heredada); `null` = ninguna utilizable (`monthly-missing`).
  readQuota(): Promise<AlertQuotaState | null>;
}

export interface AlertingDeps {
  readonly config: AlertCheckConfig;
  readonly notifier: TelegramNotifier;
  readonly store: AlertingStore;
  readonly sources: AlertingSources;
  readonly now: () => Date;
  readonly log: JsonLogger;
  readonly maxPerTick: number;
  readonly reserveSlots: number;
  readonly failureBackoffMs: number;
}

export interface Alerting {
  readonly enabled: boolean;
  // Una reserva de cuota fue denegada (se cuenta por día UTC, solo en este proceso).
  recordDeniedReservation(): void;
  // Gancho `onStaleJobsReclaimed` del driver: se anota y se avisa en el paso del tick (cuando ya hay presupuesto).
  onStaleJobsReclaimed(event: StaleReclaimEvent): Promise<void>;
  alertStep(budget: OutboundBudget): Promise<void>;
}

export function createDisabledAlerting(): Alerting {
  return {
    enabled: false,
    recordDeniedReservation: (): void => undefined,
    onStaleJobsReclaimed: (): Promise<void> => Promise.resolve(),
    alertStep: (): Promise<void> => Promise.resolve(),
  };
}

interface PendingStale {
  readonly count: number;
  readonly alertKey: string;
}

export function createAlerting(deps: AlertingDeps): Alerting {
  let startPending = true;
  let pendingStale: PendingStale | undefined;
  let denied: { readonly day: string; readonly count: number } | undefined;
  let lastFailureAt: number | undefined;

  function today(): string {
    return deps.now().toISOString().slice(0, 10);
  }

  async function sendInOrder(
    messages: readonly { readonly text: string; readonly dedupKeys: readonly string[] }[],
    budget: OutboundBudget
  ): Promise<readonly string[]> {
    const sentKeys: string[] = [];
    for (const message of messages) {
      if (!budget.tryTake()) {
        break;
      }
      const delivered = await deps.notifier.send(message.text);
      if (!delivered) {
        lastFailureAt = deps.now().getTime();
        break;
      }
      for (const key of message.dedupKeys) {
        try {
          await deps.store.record(key, deps.now());
          sentKeys.push(key);
        } catch (error) {
          deps.log.error('alert-record-failed', { reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return sentKeys;
  }

  return {
    enabled: true,

    recordDeniedReservation(): void {
      const day = today();
      denied = { day, count: denied?.day === day ? denied.count + 1 : 1 };
    },

    onStaleJobsReclaimed(event: StaleReclaimEvent): Promise<void> {
      const sameKey = pendingStale?.alertKey === event.alertKey;
      pendingStale = {
        alertKey: event.alertKey,
        count: (sameKey ? (pendingStale?.count ?? 0) : 0) + event.jobIds.length,
      };
      return Promise.resolve();
    },

    async alertStep(budget: OutboundBudget): Promise<void> {
      const now = deps.now();
      if (lastFailureAt !== undefined && now.getTime() - lastFailureAt < deps.failureBackoffMs) {
        return;
      }

      const day = today();
      const candidates = evaluateAlertChecks(
        {
          now,
          failedJobs: await deps.sources.countFailedJobs(deps.config.failedJobsWindowMs),
          staleReclaim: pendingStale,
          quota: await deps.sources.readQuota(),
          deniedReservations: denied?.day === day ? denied.count : 0,
          workerStarted: startPending,
        },
        deps.config
      );
      if (candidates.length === 0) {
        return;
      }

      const lastSent = await deps.store.readTimes(candidates.map((candidate) => candidate.dedupKey));
      const slots = Math.max(0, budget.remaining() - deps.reserveSlots);
      const selection = selectAlertsToSend(candidates, lastSent, now, { maxPerTick: deps.maxPerTick, slots });

      const sentKeys = await sendInOrder(selection.messages, budget);

      // Lo enviado o ya cubierto por el enfriamiento deja de estar pendiente; lo plegado o fallido se reintenta.
      const settled = new Set([...sentKeys, ...selection.suppressed]);
      if (settled.has('worker-started')) {
        startPending = false;
      }
      if (pendingStale !== undefined && settled.has(pendingStale.alertKey)) {
        pendingStale = undefined;
      }

      if (selection.messages.length > 0) {
        deps.log.info('alerts-dispatched', {
          sent: sentKeys.length,
          folded: selection.folded,
          suppressed: selection.suppressed.length,
        });
      }
      if (sentKeys.length > 0) {
        try {
          await deps.store.purge(new Date(deps.now().getTime() - ALERT_LOG_RETENTION_MS));
        } catch (error) {
          deps.log.warn('alert-purge-failed', { reason: error instanceof Error ? error.message : String(error) });
        }
      }
    },
  };
}

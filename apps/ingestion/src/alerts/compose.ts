// ROADMAP 3.4 (decisión 259, D17) — composición de los avisos operativos para el worker: construye el
// `Alerting` real (notificador de Telegram + fuentes y almacén sobre PostgreSQL) o el desactivado, y lo
// engancha a los puertos del driver. Separado de `scripts/coverage-worker.ts` para poder probar el cableado
// completo contra la base de datos con un Telegram falso.
import type { Database, LedgerState } from '@buscahogar/db';

import type { JsonLogger } from '../ops/json-logger.js';
import { createDbAlertingSources, createDbAlertingStore } from './alert-sources.js';
import {
  ALERT_FAILURE_BACKOFF_MS,
  createAlerting,
  createDisabledAlerting,
  HEARTBEAT_RESERVED_SLOTS,
  MAX_ALERT_MESSAGES_PER_TICK,
} from './alerting.js';
import type { Alerting } from './alerting.js';
import {
  createTelegramNotifier,
  TELEGRAM_MIN_SPACING_MS,
  TELEGRAM_TIMEOUT_MS,
} from './telegram-notifier.js';
import type { TelegramFetch } from './telegram-notifier.js';
import type { CoverageWorkerPorts } from '../sweep/coverage-worker.js';

export interface ComposeAlertingOptions {
  readonly db: Database;
  readonly sourceId: string;
  // Ausente = avisos desactivados (cero lecturas, cero red).
  readonly telegram: { readonly botToken: string; readonly chatId: string } | undefined;
  readonly alerts: {
    readonly failedJobsThreshold: number;
    readonly failedJobsWindowMs: number;
    readonly cooldownMs: number;
  };
  // Base alternativa de la API (`TELEGRAM_API_BASE_URL`, solo el Telegram falso); ausente = la real.
  readonly apiBaseUrl?: string | undefined;
  readonly fetchFn: TelegramFetch;
  // Espera abortable del apagado (la misma del worker): un SIGTERM no queda retenido por la separación de 1 s.
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly log: JsonLogger;
}

export function composeAlerting(options: ComposeAlertingOptions): Alerting {
  if (options.telegram === undefined) {
    return createDisabledAlerting();
  }
  // El logger oculta el token y el chat aunque llegaran a un mensaje (defensa en profundidad con el saneado del
  // notificador).
  options.log.redactValues([options.telegram.botToken, options.telegram.chatId]);
  return createAlerting({
    config: {
      failedJobsThreshold: options.alerts.failedJobsThreshold,
      failedJobsWindowMs: options.alerts.failedJobsWindowMs,
      failedJobsCooldownMs: options.alerts.cooldownMs,
    },
    notifier: createTelegramNotifier({
      botToken: options.telegram.botToken,
      chatId: options.telegram.chatId,
      ...(options.apiBaseUrl !== undefined ? { baseUrl: options.apiBaseUrl } : {}),
      fetchFn: options.fetchFn,
      sleep: options.sleep,
      now: () => options.now().getTime(),
      timeoutMs: TELEGRAM_TIMEOUT_MS,
      minSpacingMs: TELEGRAM_MIN_SPACING_MS,
      log: options.log,
    }),
    store: createDbAlertingStore(options.db),
    sources: createDbAlertingSources(options.db, options.sourceId),
    now: options.now,
    log: options.log,
    maxPerTick: MAX_ALERT_MESSAGES_PER_TICK,
    reserveSlots: HEARTBEAT_RESERVED_SLOTS,
    failureBackoffMs: ALERT_FAILURE_BACKOFF_MS,
  });
}

// Engancha los avisos a los puertos del driver: cuenta las reservas denegadas (un `null` de `reserveBudget`),
// recibe los jobs atascados recuperados y aporta el paso de avisos del tick. Desactivados: devuelve los MISMOS
// puertos, sin tocarlos.
export function withAlerting(ports: CoverageWorkerPorts, alerting: Alerting): CoverageWorkerPorts {
  if (!alerting.enabled) {
    return ports;
  }
  return {
    ...ports,
    reserveBudget: async (reservation, lane): Promise<LedgerState | null> => {
      const granted = await ports.reserveBudget(reservation, lane);
      if (granted === null) {
        alerting.recordDeniedReservation();
      }
      return granted;
    },
    onStaleJobsReclaimed: (event) => alerting.onStaleJobsReclaimed(event),
    onAlertStep: (budget) => alerting.alertStep(budget),
  };
}

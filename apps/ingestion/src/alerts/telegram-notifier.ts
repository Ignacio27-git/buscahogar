// ROADMAP 3.4 (decisión 259, D17; R7.1, R7.4, R7.6) — notificador de Telegram: un POST a la Bot API
// (`/bot<token>/sendMessage`) por HTTPS. Solo `apps/ingestion` lo usa (NF1: `apps/web` no llama a nada externo).
//
// Garantías:
// - Tiempo límite EXPLÍCITO por petición (`AbortSignal.timeout`) y sin seguir redirecciones: una API que no
//   responde no bloquea el tick más de `timeoutMs`.
// - Separación mínima por chat (`minSpacingMs`, 1000): antes de cada envío se espera, con la espera abortable
//   que se inyecta (`sleep`), lo que falte desde el final del envío anterior (también si falló).
// - Nunca lanza: devuelve `false` y registra UN aviso con el motivo (`timeout`/`http`/`error`). El texto del
//   aviso, el token y el id de chat NUNCA llegan al registro: el mensaje del error de red (que puede incluir la
//   URL con el token) se sanea aquí además de en el logger.
// - El token va en la ruta (así lo exige Telegram), por eso la base solo se cambia en pruebas con un HTTP falso.
import type { JsonLogger } from '../ops/json-logger.js';

export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
export const TELEGRAM_TIMEOUT_MS = 5000;
export const TELEGRAM_MIN_SPACING_MS = 1000;

const REDACTED = '[redacted]';
const MAX_ERROR_MESSAGE_LENGTH = 200;

export type TelegramFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly redirect: 'error';
    readonly signal: AbortSignal;
  }
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export interface TelegramNotifierOptions {
  readonly botToken: string;
  readonly chatId: string;
  // Solo para el HTTP falso de las pruebas; producción usa `TELEGRAM_API_BASE_URL`.
  readonly baseUrl?: string;
  readonly fetchFn: TelegramFetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly timeoutMs: number;
  readonly minSpacingMs: number;
  readonly log: JsonLogger;
}

export interface TelegramNotifier {
  // `true` si Telegram aceptó el mensaje. Nunca lanza.
  send(text: string): Promise<boolean>;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function createTelegramNotifier(options: TelegramNotifierOptions): TelegramNotifier {
  const baseUrl = options.baseUrl ?? TELEGRAM_API_BASE_URL;
  let lastFinishedAt: number | undefined;

  function sanitise(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
      .split(options.botToken)
      .join(REDACTED)
      .split(options.chatId)
      .join(REDACTED)
      .slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }

  async function waitForSpacing(): Promise<void> {
    if (lastFinishedAt === undefined) {
      return;
    }
    const wait = options.minSpacingMs - (options.now() - lastFinishedAt);
    if (wait > 0) {
      await options.sleep(wait);
    }
  }

  return {
    async send(text: string): Promise<boolean> {
      await waitForSpacing();
      try {
        const response = await options.fetchFn(`${baseUrl}/bot${options.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: options.chatId, text, disable_web_page_preview: true }),
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (!response.ok) {
          options.log.warn('alert-send-failed', { reason: 'http', status: response.status });
          return false;
        }
        return true;
      } catch (error) {
        if (isTimeout(error)) {
          options.log.warn('alert-send-failed', { reason: 'timeout', timeout_ms: options.timeoutMs });
        } else {
          options.log.warn('alert-send-failed', { reason: 'error', detail: sanitise(error) });
        }
        return false;
      } finally {
        lastFinishedAt = options.now();
      }
    },
  };
}

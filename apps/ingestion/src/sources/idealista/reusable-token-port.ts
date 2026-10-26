// ROADMAP 3.3 (decisión 272) — reutilización del token OAuth de Idealista dentro de UN proceso. Decorador puro sobre
// `IdealistaTokenPort`: cada barrido sigue creando su propia fuente (`createIdealistaSource`, que adquiere el token
// una vez y lo cachea en su instancia), pero la adquisición que esa fuente pide solo sale a la red cuando no hay un
// token vigente. Hallazgo que lo motiva: el pre-barrido real del 2026-10-26 anotó 24 tokens para 24 búsquedas.
//
// Vigencia: `expires_in` de la respuesta (12 h en la sonda del paso 1.5) menos un margen, con el reloj inyectado. Sin
// un `expires_in` válido NO se cachea: se vuelve al comportamiento anterior (un token por fuente), nunca a un token de
// vigencia desconocida. Una respuesta no `ok` o sin `access_token` tampoco se cachea.
//
// `acquisitions()` cuenta las llamadas REALES al puerto interno (también las fallidas: una petición que sale cuenta,
// mismo principio que budget.ts). Es la cifra que debe anotar el registro; `diagnostics().budget.token` de la fuente
// cuenta las adquisiciones PEDIDAS por esa instancia, que con el token reutilizado ya no son llamadas de red.
//
// Uso secuencial: el pre-barrido y el worker barren una unidad tras otra, así que no hay dos adquisiciones en vuelo.
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from './ports.js';

// Margen ante la caducidad: un barrido dura segundos, así que cinco minutos bastan para que el token no caduque a
// mitad de una unidad. Si aun así caduca, el 401 lo invalida (`invalidateOnRejectedToken`).
export const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000;

// Estado HTTP con el que el servidor de recursos rechaza un token OAuth caducado o revocado. No hay ninguna respuesta
// 401 grabada de Idealista; es el estado estándar de OAuth 2.0 (RFC 6750).
const TOKEN_REJECTED_STATUS = 401;

export interface ReusableTokenPortOptions {
  // Milisegundos de época; los tests pasan un reloj manual.
  readonly now: () => number;
  readonly marginMs?: number;
}

export interface ReusableTokenPort extends IdealistaTokenPort {
  // Llamadas reales al puerto interno desde la creación del decorador.
  acquisitions(): number;
  // Olvida el token cacheado si es `accessToken`: la siguiente adquisición sale a la red.
  invalidate(accessToken: string): void;
}

interface CachedToken {
  readonly accessToken: string;
  readonly outcome: TransportOutcome;
  readonly reuseUntil: number;
}

// Extrae `access_token` y `expires_in` sin lanzar; `null` = la respuesta no es reutilizable.
function reusableToken(outcome: TransportOutcome): { readonly accessToken: string; readonly expiresInMs: number } | null {
  if (outcome.kind !== 'ok' || typeof outcome.body !== 'object' || outcome.body === null) {
    return null;
  }
  const body = outcome.body as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    return null;
  }
  if (typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
    return null;
  }
  return { accessToken: body.access_token, expiresInMs: body.expires_in * 1000 };
}

export function createReusableTokenPort(inner: IdealistaTokenPort, options: ReusableTokenPortOptions): ReusableTokenPort {
  const marginMs = options.marginMs ?? TOKEN_EXPIRY_MARGIN_MS;
  let cached: CachedToken | undefined;
  let acquisitions = 0;

  return {
    async acquire(): Promise<TransportOutcome> {
      if (cached !== undefined && options.now() < cached.reuseUntil) {
        return cached.outcome;
      }
      cached = undefined;
      // La vigencia se mide desde ANTES de enviar: el token nunca se da por más nuevo de lo que es.
      const requestedAt = options.now();
      acquisitions += 1;
      const outcome = await inner.acquire();
      const token = reusableToken(outcome);
      if (token !== null) {
        cached = { accessToken: token.accessToken, outcome, reuseUntil: requestedAt + token.expiresInMs - marginMs };
      }
      return outcome;
    },

    acquisitions(): number {
      return acquisitions;
    },

    invalidate(accessToken: string): void {
      if (cached?.accessToken === accessToken) {
        cached = undefined;
      }
    },
  };
}

// Decorador de la búsqueda: un 401 invalida el token con el que se hizo, para que la SIGUIENTE fuente pida uno
// nuevo. La respuesta llega intacta: la fuente sigue tratándola como hasta ahora (SweepTransportError con la misma
// página como cursor de reanudación), sin reintentos dentro del barrido.
export function invalidateOnRejectedToken(
  searchPort: IdealistaSearchPort,
  tokenPort: Pick<ReusableTokenPort, 'invalidate'>
): IdealistaSearchPort {
  return {
    async search(fields, token): Promise<TransportOutcome> {
      const outcome = await searchPort.search(fields, token);
      if (outcome.kind === 'http-error' && outcome.status === TOKEN_REJECTED_STATUS) {
        tokenPort.invalidate(token);
      }
      return outcome;
    },
  };
}

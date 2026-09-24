// Paso 1.6 — puertos inyectados (diseño D1): los únicos dos caminos a la
// red. Tipos únicamente, sin implementación — la implementación real vive
// en http-client.ts, el único fichero que llama a `fetch`.
//
// El puerto devuelve un tipo de resultado TOTAL; el shell nunca interpreta
// dentro del puerto (D1). `TransportOutcome` se reutiliza tanto para la
// búsqueda como para el intercambio de token: ambas son la misma forma de
// problema (una llamada HTTP cuyo cuerpo puede o no ser JSON válido), así
// que un único tipo cubre las dos, sin inventar un segundo union sin uso
// documentado.
import type { SearchField } from './search-request.js';

export type Headers = Readonly<Record<string, string>>;

export type TransportOutcome =
  | { readonly kind: 'ok'; readonly status: number; readonly body: unknown; readonly headers: Headers }
  | { readonly kind: 'http-error'; readonly status: number; readonly bodyText: string; readonly headers: Headers }
  | { readonly kind: 'unparseable'; readonly status: number; readonly bodyText: string; readonly headers: Headers }
  | { readonly kind: 'network-error'; readonly message: string };

export interface IdealistaSearchPort {
  search(fields: readonly SearchField[], token: string): Promise<TransportOutcome>;
}

export interface IdealistaTokenPort {
  acquire(): Promise<TransportOutcome>;
}

export interface SweepEvent {
  readonly status: number;
  // Verbatim — Retry-After, cualquier cabecera de ratelimit/quota. Sin
  // clasificar: no se afirma un contrato de 429 que no se puede verificar
  // (R4, diseño D5).
  readonly headers: Headers;
  // Primeros 500 caracteres, ya scrubeados de credenciales.
  readonly bodyExcerpt: string;
}

export interface SweepLogger {
  warn(event: SweepEvent): void;
}

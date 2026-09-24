// Paso 1.14 — http-feed-fetcher.ts, el ÚNICO fetch() del adaptador de
// Kyero (diseño D1). Sin ninguna rama sobre el CONTENIDO de la respuesta —
// esa interpretación vive en feed-parser.ts (parseFeed), que recibe el
// string ya resuelto por este puerto.
//
// Sin tests dedicados, mismo precedente que
// apps/ingestion/src/sources/idealista/http-client.ts (paso 1.6, línea
// 13-17): cubrirlo exigiría pelear con test/setup-no-network.ts o hacer una
// petición real contra el dump público. La superficie de valor (parseo,
// filtrado, normalización) ya está probada en los módulos puros que rodean
// a este fichero.
import { KyeroFeedParseError } from './errors.js';
import type { FeedFetcher } from './kyero-source.js';

export interface HttpFeedFetcherOptions {
  readonly feedUrl: string;
}

export function createHttpFeedFetcher(options: HttpFeedFetcherOptions): FeedFetcher {
  return {
    async fetchFeed(): Promise<string> {
      const response = await fetch(options.feedUrl);
      if (!response.ok) {
        // Reutiliza la taxonomía de errores del adaptador (D6, tabla de
        // errors.ts) en vez de un Error genérico: un llamador que capture
        // `KyeroSweepError` sigue cubriendo también este fallo.
        throw new KyeroFeedParseError(`no se pudo obtener el feed: HTTP ${String(response.status)} (${options.feedUrl}).`);
      }
      return response.text();
    },
  };
}

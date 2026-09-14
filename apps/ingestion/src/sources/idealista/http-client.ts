// Paso 1.6 — http-client.ts, el ÚNICO fetch() del adaptador (diseño D1).
// Construye la petición, llama a fetch, lee el texto y hace un JSON.parse
// protegido — sin NINGUNA rama sobre el SIGNIFICADO de la respuesta. Esa
// interpretación vive en idealista-source.ts, sobre el TransportOutcome que
// este fichero devuelve.
//
// NUNCA se fija Content-Type a mano en la petición de búsqueda: con un
// FormData, el runtime genera el boundary del multipart, y un valor escrito
// a mano lo sustituye — el 4xx resultante llega DESPUÉS de contarse en el
// presupuesto y muy probablemente facturado (mismo hallazgo que
// scripts/probe-idealista.ts:204-209, solo lectura, no se toca).
//
// Sin tests dedicados, por el mismo precedente que scripts/probe-idealista.ts
// del paso 1.5: cubrirlo exigiría o pelear con test/setup-no-network.ts o
// gastar cuota real. La superficie de valor (construcción de la petición,
// interpretación de la respuesta) ya está probada en los módulos puros que
// rodean a este fichero (search-request.ts, sweep-planner.ts).
import { toFormData, type SearchField } from './search-request.js';
import type { Headers, IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from './ports.js';

const TOKEN_URL = 'https://api.idealista.com/oauth/token';
const SEARCH_URL = 'https://api.idealista.com/3.5/es/search';

function toPlainHeaders(headers: globalThis.Headers): Headers {
  const plain: Record<string, string> = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  return plain;
}

async function requestOutcome(request: () => Promise<Response>): Promise<TransportOutcome> {
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    return { kind: 'network-error', message: error instanceof Error ? error.message : String(error) };
  }

  const status = response.status;
  const headers = toPlainHeaders(response.headers);
  const bodyText = await response.text();

  if (!response.ok) {
    return { kind: 'http-error', status, bodyText, headers };
  }

  try {
    const body = JSON.parse(bodyText) as unknown;
    return { kind: 'ok', status, body, headers };
  } catch {
    return { kind: 'unparseable', status, bodyText, headers };
  }
}

export interface HttpTokenCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export function createHttpTokenPort(credentials: HttpTokenCredentials): IdealistaTokenPort {
  return {
    acquire(): Promise<TransportOutcome> {
      const basicAuth = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
      const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' });
      return requestOutcome(() =>
        fetch(TOKEN_URL, {
          method: 'POST',
          headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' },
          body,
        })
      );
    },
  };
}

export function createHttpSearchPort(): IdealistaSearchPort {
  return {
    search(fields: readonly SearchField[], token: string): Promise<TransportOutcome> {
      return requestOutcome(() =>
        fetch(SEARCH_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          body: toFormData(fields),
        })
      );
    },
  };
}

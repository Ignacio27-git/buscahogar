// Cliente HTTP de las pruebas que hablan con el Telegram falso (`scripts/fake-telegram.ts`). La suite deshabilita
// el `fetch` global (REQ-NONET, test/setup-no-network.ts) y se respeta: este cliente usa `node:http` y SOLO
// acepta el bucle local (127.0.0.1), así que ninguna petición puede salir de la máquina.
import { request } from 'node:http';

export interface LoopbackInit {
  readonly method: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export function loopbackFetch(url: string, init: LoopbackInit): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    if (new URL(url).hostname !== '127.0.0.1') {
      reject(new Error('loopbackFetch: solo se admite el bucle local (127.0.0.1).'));
      return;
    }
    const clientRequest = request(
      url,
      { method: init.method, headers: init.headers, ...(init.signal ? { signal: init.signal } : {}) },
      (response) => {
        response.resume();
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status });
        });
      }
    );
    clientRequest.on('error', reject);
    clientRequest.end(init.body);
  });
}

// ROADMAP 3.4 (decisión 259, D17; R7.1, R7.6, NF4) — Telegram FALSO para pruebas y para ensayar el worker en
// local: un servidor HTTP en el bucle local (127.0.0.1) que imita `POST /bot<token>/sendMessage`. Ninguna
// petición sale de la máquina; las pruebas NUNCA hablan con la API real de Telegram.
//
// Uso manual (apuntar el worker a él con `TELEGRAM_API_BASE_URL`):
//   node --import tsx scripts/fake-telegram.ts [puerto] [ok|error500|hang]
// Imprime la URL base (`http://127.0.0.1:<puerto>`) y una línea por mensaje recibido. Lo registrado NO lleva
// el token: solo si la ruta lo traía con el formato de BotFather (`tokenValid`).
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

export type FakeTelegramMode = 'ok' | 'error500' | 'hang';

export interface FakeTelegramRequest {
  readonly method: string;
  readonly chatId: string | undefined;
  readonly text: string | undefined;
  // La ruta tenía la forma `/bot<id>:<clave>/sendMessage`. El token en sí no se conserva.
  readonly tokenValid: boolean;
}

export interface FakeTelegramOptions {
  readonly port?: number;
  readonly mode?: FakeTelegramMode;
}

export interface FakeTelegram {
  readonly url: string;
  readonly requests: readonly FakeTelegramRequest[];
  setMode(mode: FakeTelegramMode): void;
  reset(): void;
  close(): Promise<void>;
}

const SEND_MESSAGE_PATH = /^\/bot(\d{3,}:[A-Za-z0-9_-]{10,})\/sendMessage$/;
// Tope del cuerpo que se lee: el servidor es de pruebas, pero no admite cuerpos sin límite.
const MAX_BODY_BYTES = 64 * 1024;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    request.on('error', () => { resolve(''); });
  });
}

function parseMessage(body: string): { chatId: string | undefined; text: string | undefined } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) {
      return { chatId: undefined, text: undefined };
    }
    const { chat_id: chatId, text } = parsed as Record<string, unknown>;
    return {
      chatId: typeof chatId === 'string' || typeof chatId === 'number' ? String(chatId) : undefined,
      text: typeof text === 'string' ? text : undefined,
    };
  } catch {
    return { chatId: undefined, text: undefined };
  }
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

export async function startFakeTelegram(options: FakeTelegramOptions = {}): Promise<FakeTelegram> {
  let mode: FakeTelegramMode = options.mode ?? 'ok';
  let requests: FakeTelegramRequest[] = [];
  const hanging = new Set<ServerResponse>();

  const server: Server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const path = request.url ?? '';
      if (request.method !== 'POST' || !SEND_MESSAGE_PATH.test(path)) {
        await readBody(request);
        reply(response, 404, { ok: false, description: 'Not Found' });
        return;
      }
      const message = parseMessage(await readBody(request));
      requests.push({ method: request.method, chatId: message.chatId, text: message.text, tokenValid: true });
      if (mode === 'hang') {
        // Nunca responde: el cliente debe cortar por su tiempo límite. Se cierra al apagar el servidor.
        hanging.add(response);
        response.on('close', () => hanging.delete(response));
        return;
      }
      if (mode === 'error500') {
        reply(response, 500, { ok: false, error_code: 500, description: 'Internal Server Error' });
        return;
      }
      reply(response, 200, { ok: true, result: { message_id: requests.length } });
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => { resolve(); });
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${String(port)}`,
    get requests(): readonly FakeTelegramRequest[] {
      return requests;
    },
    setMode(next: FakeTelegramMode): void {
      mode = next;
    },
    reset(): void {
      requests = [];
    },
    close(): Promise<void> {
      for (const response of hanging) {
        response.destroy();
      }
      return new Promise((resolve) => {
        server.close(() => { resolve(); });
        server.closeAllConnections();
      });
    },
  };
}

function isMode(value: string | undefined): value is FakeTelegramMode {
  return value === 'ok' || value === 'error500' || value === 'hang';
}

async function main(argv: readonly string[]): Promise<void> {
  const port = argv[0] !== undefined ? Number(argv[0]) : 0;
  const mode = argv[1];
  const fake = await startFakeTelegram({
    port: Number.isInteger(port) && port >= 0 ? port : 0,
    ...(isMode(mode) ? { mode } : {}),
  });
  process.stdout.write(`fake-telegram escuchando en ${fake.url} (TELEGRAM_API_BASE_URL)\n`);
  let printed = 0;
  const timer = setInterval(() => {
    for (const received of fake.requests.slice(printed)) {
      process.stdout.write(`mensaje chat=${received.chatId ?? '?'} texto=${JSON.stringify(received.text)}\n`);
    }
    printed = fake.requests.length;
  }, 200);
  const stop = (): void => {
    clearInterval(timer);
    void fake.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo patrón que scripts/sweep-zone.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2));
}

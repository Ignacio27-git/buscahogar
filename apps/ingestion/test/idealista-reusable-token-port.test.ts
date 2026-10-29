// ROADMAP 3.3 (decisión 272) — reutilización del token OAuth de Idealista dentro de una ejecución. El pre-barrido
// real del 2026-10-26 pidió un token por unidad (24 tokens para 24 búsquedas) porque cada unidad creaba su propia
// fuente y cada fuente su propio token. El decorador cachea el token mientras no caduque (`expires_in` menos un
// margen) y cuenta SOLO las llamadas reales al puerto interno, que son las que el registro mensual debe anotar.
// Puertos falsos y reloj inyectado: cero red.
import { describe, expect, it } from 'vitest';

import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../src/sources/idealista/ports.js';
import {
  createReusableTokenPort,
  invalidateOnRejectedToken,
  TOKEN_EXPIRY_MARGIN_MS,
} from '../src/sources/idealista/reusable-token-port.js';

// Puerto de token falso: cada llamada devuelve un token distinto (`token-1`, `token-2`...) con la caducidad
// pedida, o la respuesta fija que se le pase.
function createCountingTokenPort(
  respond: (call: number) => TransportOutcome = (call) => tokenOutcome(`token-${String(call)}`, 43_200)
): IdealistaTokenPort & { readonly calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    acquire(): Promise<TransportOutcome> {
      state.calls += 1;
      return Promise.resolve(respond(state.calls));
    },
  };
}

function tokenOutcome(accessToken: string, expiresIn?: number): TransportOutcome {
  return {
    kind: 'ok',
    status: 200,
    headers: {},
    body: { access_token: accessToken, token_type: 'bearer', scope: 'read', ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}) },
  };
}

function accessTokenOf(outcome: TransportOutcome): unknown {
  return outcome.kind === 'ok' ? (outcome.body as { access_token?: unknown }).access_token : undefined;
}

function manualClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms): void => {
      current += ms;
    },
  };
}

describe('createReusableTokenPort — un token por ejecución mientras no caduque (decisión 272)', () => {
  it('reutiliza el token entre adquisiciones: una sola llamada real para 24 unidades', async () => {
    const inner = createCountingTokenPort();
    const port = createReusableTokenPort(inner, { now: manualClock().now });

    const tokens: unknown[] = [];
    for (let unit = 0; unit < 24; unit += 1) {
      tokens.push(accessTokenOf(await port.acquire()));
    }

    expect(inner.calls).toBe(1);
    expect(port.acquisitions()).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(['token-1']));
  });

  it('vuelve a pedir el token cuando entra en el margen de caducidad, nunca antes', async () => {
    const clock = manualClock();
    const inner = createCountingTokenPort((call) => tokenOutcome(`token-${String(call)}`, 3_600));
    const port = createReusableTokenPort(inner, { now: clock.now, marginMs: 60_000 });

    await port.acquire();
    clock.advance(3_600_000 - 60_000 - 1);
    expect(accessTokenOf(await port.acquire())).toBe('token-1');
    expect(port.acquisitions()).toBe(1);

    clock.advance(1);
    expect(accessTokenOf(await port.acquire())).toBe('token-2');
    expect(port.acquisitions()).toBe(2);
  });

  it('el margen por defecto es de cinco minutos', async () => {
    expect(TOKEN_EXPIRY_MARGIN_MS).toBe(5 * 60_000);
    const clock = manualClock();
    const inner = createCountingTokenPort((call) => tokenOutcome(`token-${String(call)}`, 600));
    const port = createReusableTokenPort(inner, { now: clock.now });

    await port.acquire();
    clock.advance(600_000 - TOKEN_EXPIRY_MARGIN_MS - 1);
    await port.acquire();
    expect(port.acquisitions()).toBe(1);
    clock.advance(1);
    await port.acquire();
    expect(port.acquisitions()).toBe(2);
  });

  it('sin `expires_in` válido no cachea: cada adquisición es una llamada real (comportamiento anterior, nunca un token caducado)', async () => {
    for (const expiresIn of [undefined, 0, -5, Number.NaN]) {
      const inner = createCountingTokenPort((call) => tokenOutcome(`token-${String(call)}`, expiresIn));
      const port = createReusableTokenPort(inner, { now: manualClock().now });

      await port.acquire();
      await port.acquire();

      expect(inner.calls).toBe(2);
      expect(port.acquisitions()).toBe(2);
    }
  });

  it('una respuesta fallida no se cachea y cuenta como llamada real; la siguiente vuelve a la red', async () => {
    const inner = createCountingTokenPort((call) =>
      call === 1
        ? { kind: 'http-error', status: 500, headers: {}, bodyText: 'boom' }
        : tokenOutcome(`token-${String(call)}`, 43_200)
    );
    const port = createReusableTokenPort(inner, { now: manualClock().now });

    expect((await port.acquire()).kind).toBe('http-error');
    expect(accessTokenOf(await port.acquire())).toBe('token-2');
    expect(accessTokenOf(await port.acquire())).toBe('token-2');
    expect(port.acquisitions()).toBe(2);
  });

  it('un cuerpo sin `access_token` no se cachea', async () => {
    const inner = createCountingTokenPort(() => ({ kind: 'ok', status: 200, headers: {}, body: { expires_in: 43_200 } }));
    const port = createReusableTokenPort(inner, { now: manualClock().now });

    await port.acquire();
    await port.acquire();

    expect(port.acquisitions()).toBe(2);
  });

  it('invalidate(token) olvida el token cacheado solo si es ese mismo token', async () => {
    const inner = createCountingTokenPort();
    const port = createReusableTokenPort(inner, { now: manualClock().now });

    await port.acquire();
    port.invalidate('otro-token');
    expect(accessTokenOf(await port.acquire())).toBe('token-1');
    expect(port.acquisitions()).toBe(1);

    port.invalidate('token-1');
    expect(accessTokenOf(await port.acquire())).toBe('token-2');
    expect(port.acquisitions()).toBe(2);
  });
});

describe('invalidateOnRejectedToken — un 401 de la búsqueda invalida el token reutilizado', () => {
  function searchPortAnswering(outcome: TransportOutcome): IdealistaSearchPort & { readonly tokens: string[] } {
    const tokens: string[] = [];
    return {
      tokens,
      search(_fields, token): Promise<TransportOutcome> {
        tokens.push(token);
        return Promise.resolve(outcome);
      },
    };
  }

  it('con un 401 la siguiente adquisición vuelve a la red; la respuesta llega intacta al llamador', async () => {
    const tokenPort = createReusableTokenPort(createCountingTokenPort(), { now: manualClock().now });
    const rejected: TransportOutcome = { kind: 'http-error', status: 401, headers: {}, bodyText: 'invalid_token' };
    const searchPort = invalidateOnRejectedToken(searchPortAnswering(rejected), tokenPort);

    const token = accessTokenOf(await tokenPort.acquire());
    expect(await searchPort.search([], String(token))).toEqual(rejected);

    expect(accessTokenOf(await tokenPort.acquire())).toBe('token-2');
    expect(tokenPort.acquisitions()).toBe(2);
  });

  it('cualquier otra respuesta (200, 429, 500, error de red) conserva el token', async () => {
    const outcomes: TransportOutcome[] = [
      { kind: 'ok', status: 200, headers: {}, body: {} },
      { kind: 'http-error', status: 429, headers: {}, bodyText: 'Too Many Requests' },
      { kind: 'http-error', status: 500, headers: {}, bodyText: 'boom' },
      { kind: 'network-error', message: 'ECONNRESET' },
    ];
    const tokenPort = createReusableTokenPort(createCountingTokenPort(), { now: manualClock().now });
    const token = String(accessTokenOf(await tokenPort.acquire()));

    for (const outcome of outcomes) {
      await invalidateOnRejectedToken(searchPortAnswering(outcome), tokenPort).search([], token);
    }

    expect(accessTokenOf(await tokenPort.acquire())).toBe('token-1');
    expect(tokenPort.acquisitions()).toBe(1);
  });
});

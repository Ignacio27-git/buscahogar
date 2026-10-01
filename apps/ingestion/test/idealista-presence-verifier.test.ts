// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — el verificador de
// presencia de Idealista: EXACTAMENTE una petición por lote, presupuesto gastado
// antes de enviar, y cualquier fallo devuelve todos los ids como ambiguos sin
// lanzar (S-LR-3, 6, 7, 11, 13, 19). Puertos falsos: cero red (S-LR-19).
import { describe, expect, it } from 'vitest';

import type { PresenceBatch } from '@buscahogar/core';

import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../src/sources/idealista/ports.js';
import { DELISTED_OMISSION_CONFIRMED } from '../src/sources/idealista/presence-evidence.js';
import { createIdealistaPresenceVerifier } from '../src/sources/idealista/presence-verifier.js';
import type { IdealistaPresenceVerifier } from '../src/sources/idealista/presence-verifier.js';
import type { SearchField } from '../src/sources/idealista/search-request.js';

const TOKEN = 'token-secreto-de-prueba';

const BATCH: PresenceBatch = {
  center: { latitude: 40.43, longitude: -3.702 },
  radiusMeters: 4500,
  operation: 'sale',
  groupKey: 'homes',
  externalIds: ['100', '200', '300'],
};

function reply(ids: readonly string[]): TransportOutcome {
  return {
    kind: 'ok',
    status: 200,
    headers: {},
    body: {
      elementList: ids.map((propertyCode) => ({ propertyCode })),
      totalPages: 1,
      actualPage: 1,
      itemsPerPage: 50,
    },
  };
}

interface Harness {
  readonly searches: (readonly SearchField[])[];
  readonly tokens: { count: number };
  readonly logged: string[];
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
}

function harness(
  searchOutcome: () => Promise<TransportOutcome> | TransportOutcome,
  tokenOutcome: TransportOutcome = { kind: 'ok', status: 200, headers: {}, body: { access_token: TOKEN } }
): Harness {
  const searches: (readonly SearchField[])[] = [];
  const tokens = { count: 0 };
  return {
    searches,
    tokens,
    logged: [],
    searchPort: {
      async search(fields: readonly SearchField[], token: string): Promise<TransportOutcome> {
        expect(token).toBe(TOKEN);
        searches.push(fields);
        return searchOutcome();
      },
    },
    tokenPort: {
      acquire(): Promise<TransportOutcome> {
        tokens.count += 1;
        return Promise.resolve(tokenOutcome);
      },
    },
  };
}

function build(
  h: Harness,
  overrides: { omissionConfirmed?: boolean; maxRequests?: number } = {}
): IdealistaPresenceVerifier {
  return createIdealistaPresenceVerifier({
    searchPort: h.searchPort,
    tokenPort: h.tokenPort,
    radiusMarginM: 500,
    maxRequests: overrides.maxRequests ?? 3,
    ...(overrides.omissionConfirmed === undefined ? {} : { omissionConfirmed: overrides.omissionConfirmed }),
    log: (line: string): void => {
      h.logged.push(line);
    },
  });
}

function asObject(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(map);
}

describe('createIdealistaPresenceVerifier — una petición por lote (LR-3)', () => {
  it('envía UNA petición con los campos del lote y clasifica la respuesta (omisión confirmada)', async () => {
    const h = harness(() => reply(['100', '300']));
    const verifier = build(h, { omissionConfirmed: true });

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(h.searches).toHaveLength(1);
    expect(Object.fromEntries((h.searches[0] ?? []).map((field) => [field.name, field.value]))).toEqual({
      center: '40.43,-3.702',
      distance: '5000',
      propertyType: 'homes',
      operation: 'sale',
      maxItems: '50',
      numPage: '1',
      adIds: '100,200,300',
    });
    expect(asObject(verdicts)).toEqual({ '100': 'present', '200': 'absent', '300': 'present' });
  });

  it('con el valor COMMITEADO de la constante, un id omitido es absent solo si la constante está confirmada', async () => {
    const h = harness(() => reply(['100', '300']));
    const verifier = build(h);

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(verdicts.get('200')).toBe(DELISTED_OMISSION_CONFIRMED ? 'absent' : 'ambiguous');
    expect(verdicts.get('100')).toBe('present');
  });

  it('dos lotes: dos peticiones de búsqueda y UN solo token (se cachea)', async () => {
    const h = harness(() => reply(['100', '200', '300']));
    const verifier = build(h);

    await verifier.verifyBatch(BATCH);
    await verifier.verifyBatch({ ...BATCH, groupKey: 'premises' });

    expect(h.searches).toHaveLength(2);
    expect(h.tokens.count).toBe(1);
    expect(verifier.budgetSnapshot()).toEqual({ search: 2, token: 1 });
  });

  it('un lote de más de 50 ids no se envía: todo ambiguo, cero peticiones', async () => {
    const h = harness(() => reply([]));
    const verifier = build(h, { omissionConfirmed: true });
    const ids = Array.from({ length: 51 }, (_, index) => String(index));

    const verdicts = await verifier.verifyBatch({ ...BATCH, externalIds: ids });

    expect(h.searches).toHaveLength(0);
    expect(verdicts.size).toBe(51);
    expect([...verdicts.values()].every((verdict) => verdict === 'ambiguous')).toBe(true);
    expect(verifier.budgetSnapshot()).toEqual({ search: 0, token: 0 });
  });

  it('S-LR-11: un groupKey que no es un filtro de Idealista no se envía: todo ambiguo, cero peticiones', async () => {
    const h = harness(() => reply([]));
    const verifier = build(h, { omissionConfirmed: true });

    const verdicts = await verifier.verifyBatch({ ...BATCH, groupKey: 'chalets' });

    expect(h.searches).toHaveLength(0);
    expect(asObject(verdicts)).toEqual({ '100': 'ambiguous', '200': 'ambiguous', '300': 'ambiguous' });
  });

  it('un lote vacío no gasta nada', async () => {
    const h = harness(() => reply([]));
    const verifier = build(h);

    const verdicts = await verifier.verifyBatch({ ...BATCH, externalIds: [] });

    expect(verdicts.size).toBe(0);
    expect(h.searches).toHaveLength(0);
    expect(h.tokens.count).toBe(0);
  });
});

describe('createIdealistaPresenceVerifier — fallos: todo ambiguo, nunca lanza (S-LR-6, S-LR-7)', () => {
  const allAmbiguous = { '100': 'ambiguous', '200': 'ambiguous', '300': 'ambiguous' };

  it.each([
    ['429', { kind: 'http-error', status: 429, bodyText: 'cuota', headers: {} }],
    ['500', { kind: 'http-error', status: 500, bodyText: 'boom', headers: {} }],
    ['timeout', { kind: 'network-error', message: 'timeout' }],
    ['cuerpo no JSON', { kind: 'unparseable', status: 200, bodyText: '<html>', headers: {} }],
  ] as const)('%s en la búsqueda -> todo ambiguo; la petición fallida cuenta como gastada', async (_name, outcome) => {
    const h = harness(() => outcome);
    const verifier = build(h, { omissionConfirmed: true });

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(asObject(verdicts)).toEqual(allAmbiguous);
    expect(verifier.budgetSnapshot()).toEqual({ search: 1, token: 1 });
  });

  it('una excepción del puerto de búsqueda se captura: todo ambiguo y la petición cuenta', async () => {
    const h = harness(() => Promise.reject(new Error('socket colgado')));
    const verifier = build(h, { omissionConfirmed: true });

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(asObject(verdicts)).toEqual(allAmbiguous);
    expect(verifier.budgetSnapshot()).toEqual({ search: 1, token: 1 });
    expect(h.logged.join('\n')).toContain('socket colgado');
  });

  it('un fallo al obtener el token: todo ambiguo y NO se envía ninguna búsqueda', async () => {
    const h = harness(() => reply(['100']), { kind: 'http-error', status: 401, bodyText: 'no', headers: {} });
    const verifier = build(h, { omissionConfirmed: true });

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(asObject(verdicts)).toEqual(allAmbiguous);
    expect(h.searches).toHaveLength(0);
    expect(verifier.budgetSnapshot()).toEqual({ search: 0, token: 1 });
  });

  it('un token sin access_token no vacío: todo ambiguo, sin búsqueda', async () => {
    const h = harness(() => reply(['100']), { kind: 'ok', status: 200, headers: {}, body: { access_token: '' } });
    const verifier = build(h);

    const verdicts = await verifier.verifyBatch(BATCH);

    expect(asObject(verdicts)).toEqual(allAmbiguous);
    expect(h.searches).toHaveLength(0);
  });

  it('S-LR-8: un id ajeno en la respuesta (adIds ignorado) -> todo ambiguo aunque la omisión esté confirmada', async () => {
    const h = harness(() => reply(['100', '999']));
    const verifier = build(h, { omissionConfirmed: true });

    expect(asObject(await verifier.verifyBatch(BATCH))).toEqual(allAmbiguous);
  });

  it('el registro de fallos no contiene el token ni el cuerpo de la respuesta', async () => {
    const h = harness(() => ({ kind: 'http-error', status: 500, bodyText: `error con ${TOKEN}`, headers: {} }));
    const verifier = build(h);

    await verifier.verifyBatch(BATCH);

    expect(h.logged.length).toBeGreaterThan(0);
    expect(h.logged.join('\n')).not.toContain(TOKEN);
    expect(h.logged.join('\n')).toContain('500');
  });
});

describe('createIdealistaPresenceVerifier — tope duro de peticiones (S-LR-13, S-LR-14)', () => {
  it('con maxRequests = 1 el segundo lote NO se envía: todo ambiguo y la búsqueda no sale', async () => {
    const h = harness(() => reply(['100', '200', '300']));
    const verifier = build(h, { maxRequests: 1, omissionConfirmed: true });

    const first = await verifier.verifyBatch(BATCH);
    const second = await verifier.verifyBatch({ ...BATCH, groupKey: 'premises' });

    expect(h.searches).toHaveLength(1);
    expect(asObject(first)).toEqual({ '100': 'present', '200': 'present', '300': 'present' });
    expect(asObject(second)).toEqual({ '100': 'ambiguous', '200': 'ambiguous', '300': 'ambiguous' });
    expect(verifier.budgetSnapshot()).toEqual({ search: 1, token: 1 });
  });
});

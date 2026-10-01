// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — clasificador PURO
// de la respuesta de una verificación por `adIds` (S-LR-5, 6, 7, 8, 9, 10, 20).
// Regla de oro: ante cualquier duda, el lote ENTERO es ambiguo y nada se retira.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { classifyPresence } from '../src/sources/idealista/presence-classify.js';
import type { TransportOutcome } from '../src/sources/idealista/ports.js';

// Envelope real anonimizado (forma real de la API: clave `total`, `summary`…).
const REAL_HOMES = JSON.parse(
  readFileSync(new URL('./fixtures/idealista/search-homes-2026-09-10.json', import.meta.url), 'utf8')
) as { elementList: { propertyCode: string }[] } & Record<string, unknown>;

const [ID_A = '', ID_B = '', ID_C = ''] = REAL_HOMES.elementList.map((element) => element.propertyCode);

function okReply(returnedIds: readonly (string | number)[], overrides: Record<string, unknown> = {}): TransportOutcome {
  return {
    kind: 'ok',
    status: 200,
    headers: {},
    body: {
      ...REAL_HOMES,
      elementList: returnedIds.map((propertyCode) => ({ propertyCode })),
      totalPages: 1,
      actualPage: 1,
      itemsPerPage: 50,
      ...overrides,
    },
  };
}

function verdicts(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(map);
}

describe('classifyPresence — envelope fiable, adIds respetado (S-LR-5, S-LR-16)', () => {
  it('los ids devueltos son present; los omitidos son absent SOLO con la omisión confirmada (S-LR-5)', () => {
    const result = classifyPresence([ID_A, ID_B, ID_C], okReply([ID_A, ID_C]), true);

    expect(verdicts(result)).toEqual({ [ID_A]: 'present', [ID_B]: 'absent', [ID_C]: 'present' });
  });

  it('S-LR-9: con la omisión SIN confirmar, un id omitido es ambiguous y nunca absent', () => {
    const result = classifyPresence([ID_A, ID_B, ID_C], okReply([ID_A, ID_C]), false);

    expect(verdicts(result)).toEqual({ [ID_A]: 'present', [ID_B]: 'ambiguous', [ID_C]: 'present' });
  });

  it('todos devueltos -> todos present, tanto con la omisión confirmada como sin confirmar', () => {
    for (const confirmed of [true, false]) {
      const result = classifyPresence([ID_A, ID_B], okReply([ID_B, ID_A]), confirmed);
      expect(verdicts(result)).toEqual({ [ID_A]: 'present', [ID_B]: 'present' });
    }
  });

  // Corrección S3: una respuesta vacía a un lote de 2+ ids es indistinguible de "la API
  // ignoró adIds / filtró mal en una zona sin stock": NO es evidencia de baja.
  it('2+ ids pedidos y NINGUNO vuelve -> todo el lote ambiguo, aunque la omisión esté confirmada', () => {
    const empty = okReply([], { totalPages: 0 });

    for (const confirmed of [true, false]) {
      expect(verdicts(classifyPresence([ID_A, ID_B], empty, confirmed))).toEqual({
        [ID_A]: 'ambiguous',
        [ID_B]: 'ambiguous',
      });
    }
  });

  it('2+ ids pedidos y vuelve al menos UNO -> los omitidos son absent si la omisión está confirmada', () => {
    const result = classifyPresence([ID_A, ID_B, ID_C], okReply([ID_B]), true);

    expect(verdicts(result)).toEqual({ [ID_A]: 'absent', [ID_B]: 'present', [ID_C]: 'absent' });
  });

  it('un lote de UN id con respuesta vacía: absent si la omisión está confirmada, ambiguous si no', () => {
    const empty = okReply([], { totalPages: 0 });

    expect(verdicts(classifyPresence([ID_A], empty, true))).toEqual({ [ID_A]: 'absent' });
    expect(verdicts(classifyPresence([ID_A], empty, false))).toEqual({ [ID_A]: 'ambiguous' });
  });

  it('un propertyCode numérico casa con el id externo en texto', () => {
    const result = classifyPresence(['111741132'], okReply([111741132]), true);

    expect(verdicts(result)).toEqual({ '111741132': 'present' });
  });

  it('ids pedidos repetidos dan un único veredicto', () => {
    const result = classifyPresence([ID_A, ID_A], okReply([ID_A]), true);

    expect([...result.entries()]).toEqual([[ID_A, 'present']]);
  });
});

describe('classifyPresence — todo el lote ambiguo ante cualquier duda', () => {
  const allAmbiguous = { [ID_A]: 'ambiguous', [ID_B]: 'ambiguous' };

  it('S-LR-8: un id DEVUELTO que no se pidió (adIds ignorado) vuelve ambiguo todo el lote, aunque la omisión esté confirmada', () => {
    const result = classifyPresence([ID_A, ID_B], okReply([ID_A, ID_C]), true);

    expect(verdicts(result)).toEqual(allAmbiguous);
  });

  it('S-LR-10: totalPages > 1 vuelve ambiguo todo el lote', () => {
    const result = classifyPresence([ID_A, ID_B], okReply([ID_A], { totalPages: 2 }), true);

    expect(verdicts(result)).toEqual(allAmbiguous);
  });

  it.each([
    ['429', { kind: 'http-error', status: 429, bodyText: 'too many', headers: {} }],
    ['500', { kind: 'http-error', status: 500, bodyText: 'boom', headers: {} }],
    ['error de red / timeout', { kind: 'network-error', message: 'timeout' }],
    ['cuerpo no JSON', { kind: 'unparseable', status: 200, bodyText: '<html>', headers: {} }],
  ] as const)('S-LR-7: %s -> todo el lote ambiguo', (_name, outcome) => {
    expect(verdicts(classifyPresence([ID_A, ID_B], outcome, true))).toEqual(allAmbiguous);
  });

  it.each([
    ['null', null],
    ['cuerpo vacío (objeto sin campos)', {}],
    ['un array en vez de un objeto', []],
    ['sin elementList', { totalPages: 1, actualPage: 1, itemsPerPage: 50 }],
    ['elementList que no es un array', { elementList: 'x', totalPages: 1, actualPage: 1, itemsPerPage: 50 }],
    ['sin totalPages', { elementList: [], actualPage: 1, itemsPerPage: 50 }],
    ['totalPages negativo', { elementList: [], totalPages: -1, actualPage: 1, itemsPerPage: 50 }],
  ] as const)('S-LR-6: envelope inválido (%s) -> todo el lote ambiguo', (_name, body) => {
    const outcome: TransportOutcome = { kind: 'ok', status: 200, headers: {}, body };

    expect(verdicts(classifyPresence([ID_A, ID_B], outcome, true))).toEqual(allAmbiguous);
  });

  it('un elemento sin propertyCode utilizable hace inverificable el lote entero', () => {
    const outcome: TransportOutcome = {
      kind: 'ok',
      status: 200,
      headers: {},
      body: {
        elementList: [{ propertyCode: ID_A }, { price: 1 }],
        totalPages: 1,
        actualPage: 1,
        itemsPerPage: 50,
      },
    };

    expect(verdicts(classifyPresence([ID_A, ID_B], outcome, true))).toEqual(allAmbiguous);
  });

  it('sin ids pedidos devuelve un mapa vacío sin mirar la respuesta', () => {
    expect(classifyPresence([], okReply([ID_A]), true).size).toBe(0);
  });
});

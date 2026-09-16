import { describe, expect, it } from 'vitest';

import { buildPropertyGroups } from '../src/consolidation/grouping.js';
import type { ClassifiedPair } from '../src/types/classified-pair.js';

// Fábrica mínima de ClassifiedPair para estos tests: band es el único campo
// que buildPropertyGroups interpreta (D3); score se lleva porque el tipo lo
// exige, pero el algoritmo de agrupación nunca lo lee.
function pair(listingAId: string, listingBId: string, band: ClassifiedPair['band'], score = 0.5): ClassifiedPair {
  return { listingAId, listingBId, band, score };
}

describe('GROUP-1a: una cadena de accepts forma un único grupo', () => {
  it('A-B y B-C accept ⇒ A, B y C quedan en el mismo grupo', () => {
    const result = buildPropertyGroups(['a', 'b', 'c'], [pair('a', 'b', 'accept'), pair('b', 'c', 'accept')]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.listingIds).toEqual(['a', 'b', 'c']);
    expect(result.refusedComponents).toHaveLength(0);
  });
});

describe('GROUP-2a: un par nunca comparado no es un conflicto (Q2a)', () => {
  it('A-C nunca puntuado por el bloqueo no bloquea la fusión de A, B y C', () => {
    // El bloqueo nunca propuso A-C: no aparece en absoluto en `pairs`, ni
    // siquiera como 'undecided'. El silencio no es evidencia contra fusionar.
    const result = buildPropertyGroups(['a', 'b', 'c'], [pair('a', 'b', 'accept'), pair('b', 'c', 'accept')]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.listingIds).toEqual(['a', 'b', 'c']);
    expect(result.refusedComponents).toHaveLength(0);
  });
});

describe("D2: un par 'undecided' es un tercer estado distinto — ni bloquea ni causa fusión", () => {
  it('A-B accept, A-C undecided ⇒ A y B se agrupan; C queda en su propio grupo singleton', () => {
    const result = buildPropertyGroups(['a', 'b', 'c'], [pair('a', 'b', 'accept'), pair('a', 'c', 'undecided')]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.listingIds)).toEqual([['a', 'b'], ['c']]);
    expect(result.refusedComponents).toHaveLength(0);
  });
});

describe('GROUP-3a / D2: un reject interno real rechaza el componente ENTERO, nunca lo divide', () => {
  it('A-B y B-C accept, A-C reject ⇒ tres propiedades singleton, ningún miembro se pierde', () => {
    const conflictingPair = pair('a', 'c', 'reject');
    const result = buildPropertyGroups(
      ['a', 'b', 'c'],
      [pair('a', 'b', 'accept'), pair('b', 'c', 'accept'), conflictingPair]
    );

    expect(result.groups).toHaveLength(3);
    expect(result.groups.map((group) => group.listingIds)).toEqual([['a'], ['b'], ['c']]);
    expect(result.refusedComponents).toHaveLength(1);
    expect(result.refusedComponents[0]?.listingIds).toEqual(['a', 'b', 'c']);
    expect(result.refusedComponents[0]?.conflictingPairs).toEqual([conflictingPair]);
  });

  it('un reject entre dos componentes DISTINTOS no es un conflicto — ninguno de los dos iba a fusionarse', () => {
    // D distinto componente de A-B-C: el reject A-D no encuentra la misma
    // raíz en ningún lado (D nunca se unió con nadie), así que el paso 3 de
    // D3 no lo registra como conflicto — no hay nada que rechazar.
    const result = buildPropertyGroups(
      ['a', 'b', 'c', 'd'],
      [pair('a', 'b', 'accept'), pair('b', 'c', 'accept'), pair('a', 'd', 'reject')]
    );

    expect(result.refusedComponents).toHaveLength(0);
    expect(result.groups.map((group) => group.listingIds)).toEqual([['a', 'b', 'c'], ['d']]);
  });
});

describe('EVID-3/PROP-3b (a través de D3): todo listing termina en exactamente un grupo', () => {
  it('un listing sin ninguna arista accept, solo undecided, sigue formando su propio grupo singleton', () => {
    // Este es el punto donde spec y diseño discreparon (obs #162): un
    // listing sin duplicado detectado NO puede quedar fuera de `groups` —
    // ROADMAP 1.11 busca contra `properties`, y un listing ausente de
    // `groups` desaparecería del producto.
    const result = buildPropertyGroups(['a', 'b'], [pair('a', 'b', 'undecided')]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.listingIds)).toEqual([['a'], ['b']]);
    expect(result.refusedComponents).toHaveLength(0);
  });

  it('un listing sin ningún par en absoluto también forma su propio grupo singleton', () => {
    const result = buildPropertyGroups(['a', 'b', 'z'], [pair('a', 'b', 'accept')]);

    expect(result.groups.map((group) => group.listingIds)).toEqual([['a', 'b'], ['z']]);
  });
});

describe('GROUP-4a: la agrupación es determinista, sin importar el orden de los pares de entrada', () => {
  it('barajar el orden de los pares de entrada produce un resultado byte-idéntico', () => {
    const listingIds = ['d', 'b', 'a', 'c'];
    const acceptAB = pair('a', 'b', 'accept');
    const acceptBC = pair('b', 'c', 'accept');
    const undecidedCD = pair('c', 'd', 'undecided');

    const resultInOrder = buildPropertyGroups(listingIds, [acceptAB, acceptBC, undecidedCD]);
    const resultShuffled = buildPropertyGroups(listingIds, [undecidedCD, acceptAB, acceptBC]);

    expect(resultShuffled).toEqual(resultInOrder);
    expect(resultInOrder.groups.map((group) => group.listingIds)).toEqual([['a', 'b', 'c'], ['d']]);

    // Repetir la misma llamada produce el mismo resultado: no solo
    // insensible al orden de entrada, sino reproducible entre llamadas
    // (el requisito real de un reproceso comparable, GROUP-4).
    expect(buildPropertyGroups(listingIds, [acceptAB, acceptBC, undecidedCD])).toEqual(resultInOrder);
  });
});

// ROADMAP 2.3 — compareImageHashes (spec "Positive-Only Level Mapping",
// decisión 094): mapeo a UN nivel (strong/neutral) y UNA razón, tabla por
// tabla, con la precedencia fija missing > unreadable > low-entropy >
// distance. Nunca negativo: todo lo que no es `strong/match` es neutral,
// contribución exactamente cero.
import { describe, expect, it } from 'vitest';

import type { ImageHashEntry } from '../src/strategies/image/compare.js';
import { compareImageHashes } from '../src/strategies/image/compare.js';

const THRESHOLD = 8;

function hashed(hash: string, lowEntropy = false): ImageHashEntry {
  return { kind: 'hashed', hash, lowEntropy };
}

const UNREADABLE: ImageHashEntry = { kind: 'unreadable' };

// Dos hashes fijos a distancia EXACTA 8 (el umbral) — construidos a mano:
// difieren en los 8 bits altos del primer byte, 0 en el resto.
const BASE_HASH = '0000000000000000';
const DISTANCE_8_HASH = 'ff00000000000000'; // 8 bits distintos exactos
const DISTANCE_9_HASH = 'ff80000000000000'; // 9 bits distintos exactos

describe('compareImageHashes (ROADMAP 2.3, spec "Positive-Only Level Mapping")', () => {
  it('strong/match cuando d<=T y ningún lado es low-entropy', () => {
    const result = compareImageHashes(hashed(BASE_HASH), hashed(DISTANCE_8_HASH), THRESHOLD);

    expect(result).toEqual({ level: 'strong', reason: 'match', distance: 8, threshold: THRESHOLD });
  });

  it('neutral/above-threshold cuando d>T', () => {
    const result = compareImageHashes(hashed(BASE_HASH), hashed(DISTANCE_9_HASH), THRESHOLD);

    expect(result).toEqual({
      level: 'neutral',
      reason: 'above-threshold',
      distance: 9,
      threshold: THRESHOLD,
    });
  });

  it('neutral/missing cuando falta el hash en un lado', () => {
    const missingA = compareImageHashes(undefined, hashed(BASE_HASH), THRESHOLD);
    const missingB = compareImageHashes(hashed(BASE_HASH), undefined, THRESHOLD);

    expect(missingA).toEqual({
      level: 'neutral',
      reason: 'missing',
      distance: null,
      threshold: THRESHOLD,
    });
    expect(missingB).toEqual({
      level: 'neutral',
      reason: 'missing',
      distance: null,
      threshold: THRESHOLD,
    });
  });

  it('neutral/unreadable cuando un lado es unreadable', () => {
    const unreadableA = compareImageHashes(UNREADABLE, hashed(BASE_HASH), THRESHOLD);
    const unreadableB = compareImageHashes(hashed(BASE_HASH), UNREADABLE, THRESHOLD);

    expect(unreadableA).toEqual({
      level: 'neutral',
      reason: 'unreadable',
      distance: null,
      threshold: THRESHOLD,
    });
    expect(unreadableB).toEqual({
      level: 'neutral',
      reason: 'unreadable',
      distance: null,
      threshold: THRESHOLD,
    });
  });

  it('neutral/low-entropy en un lado que de otro modo sería <=T (distancia SÍ se calcula y se reporta)', () => {
    const result = compareImageHashes(hashed(BASE_HASH, true), hashed(DISTANCE_8_HASH), THRESHOLD);

    expect(result).toEqual({
      level: 'neutral',
      reason: 'low-entropy',
      distance: 8,
      threshold: THRESHOLD,
    });
  });

  it('precedencia: missing > unreadable > low-entropy > distance — missing sobre unreadable', () => {
    const result = compareImageHashes(undefined, UNREADABLE, THRESHOLD);

    expect(result.reason).toBe('missing');
  });

  it('precedencia: unreadable sobre low-entropy', () => {
    const result = compareImageHashes(UNREADABLE, hashed(BASE_HASH, true), THRESHOLD);

    expect(result.reason).toBe('unreadable');
  });

  it('precedencia: low-entropy sobre distance (aunque el otro lado no sea low-entropy)', () => {
    const result = compareImageHashes(hashed(BASE_HASH), hashed(DISTANCE_8_HASH, true), THRESHOLD);

    expect(result.reason).toBe('low-entropy');
  });

  it('frontera: d===T es strong/match', () => {
    expect(compareImageHashes(hashed(BASE_HASH), hashed(DISTANCE_8_HASH), 8).level).toBe('strong');
  });

  it('frontera: d===T+1 es neutral/above-threshold', () => {
    expect(compareImageHashes(hashed(BASE_HASH), hashed(DISTANCE_9_HASH), 8).level).toBe('neutral');
  });
});
